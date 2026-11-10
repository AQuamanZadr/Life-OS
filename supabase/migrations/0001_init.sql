-- Life OS — начальная схема базы данных (PostgreSQL / Supabase).
--
-- Принципы:
--   * все идентификаторы — UUID, все моменты времени — TIMESTAMPTZ (UTC);
--   * каждая таблица защищена Row Level Security: владелец видит только свои строки;
--   * version + last_op_id обеспечивают optimistic concurrency и идемпотентную синхронизацию;
--   * server_updated_at — курсор для загрузки изменений на устройства;
--   * денежные суммы — NUMERIC, не FLOAT;
--   * у каждого внешнего ключа явно задано правило удаления.
--
-- Откат: supabase/rollback/0001_init.down.sql

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Служебные функции
-- ---------------------------------------------------------------------------

-- Версионирование строки. Клиент не может подделать version, user_id и created_at.
create or replace function private.touch_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.user_id := coalesce(auth.uid(), new.user_id);
  else
    new.version := old.version + 1;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create table public.tombstones (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  deleted_at timestamptz not null default clock_timestamp()
);
create index tombstones_user_deleted_idx on public.tombstones (user_id, deleted_at);
alter table public.tombstones enable row level security;
create policy tombstones_select on public.tombstones for select to authenticated using (user_id = (select auth.uid()));
comment on table public.tombstones is 'Отметки об окончательно удалённых записях — чтобы удаление дошло до всех устройств.';

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_at timestamptz not null default clock_timestamp(),
  change_summary text not null default ''
);
create index audit_logs_user_changed_idx on public.audit_logs (user_id, changed_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated using (user_id = (select auth.uid()));
comment on table public.audit_logs is 'Журнал изменений. Заполняется только триггерами; клиент может лишь читать.';

create or replace function private.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changed text;
begin
  if tg_op = 'DELETE' then
    insert into public.tombstones (user_id, entity_type, entity_id) values (old.user_id, tg_table_name, old.id);
    insert into public.audit_logs (user_id, entity_type, entity_id, action) values (old.user_id, tg_table_name, old.id, 'delete');
    return old;
  elsif tg_op = 'INSERT' then
    insert into public.audit_logs (user_id, entity_type, entity_id, action) values (new.user_id, tg_table_name, new.id, 'insert');
  else
    select coalesce(string_agg(n.key, ', ' order by n.key), '') into changed
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value
      and n.key not in ('version', 'updated_at', 'server_updated_at', 'last_op_id', 'search');
    insert into public.audit_logs (user_id, entity_type, entity_id, action, change_summary) values (new.user_id, tg_table_name, new.id, 'update', changed);
  end if;
  return new;
end $$;

-- Добавляет таблице общие колонки, индексы, триггеры и политики RLS.
create or replace function private.make_synced(tbl text) returns void
language plpgsql set search_path = '' as $$
begin
  execute format($f$
    alter table public.%1$I
      add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade on update cascade,
      add column created_at timestamptz not null default now(),
      add column updated_at timestamptz not null default now(),
      add column deleted_at timestamptz,
      add column archived_at timestamptz,
      add column version integer not null default 1,
      add column last_op_id uuid,
      add column server_updated_at timestamptz not null default clock_timestamp()
  $f$, tbl);
  execute format('create index %I on public.%I (user_id, server_updated_at)', tbl || '_sync_idx', tbl);
  execute format('create index %I on public.%I (user_id, created_at)', tbl || '_created_idx', tbl);
  execute format('create index %I on public.%I (user_id, updated_at)', tbl || '_updated_idx', tbl);
  execute format('create trigger touch_row before insert or update on public.%I for each row execute function private.touch_row()', tbl);
  execute format('create trigger log_change after insert or update or delete on public.%I for each row execute function private.log_change()', tbl);
  execute format('alter table public.%I enable row level security', tbl);
  execute format('alter table public.%I force row level security', tbl);
  execute format('create policy owner_select on public.%I for select to authenticated using (user_id = (select auth.uid()))', tbl);
  execute format('create policy owner_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', tbl);
  execute format('create policy owner_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl);
  execute format('create policy owner_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))', tbl);
  execute format('revoke all on public.%I from anon', tbl);
  execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
end $$;

-- ---------------------------------------------------------------------------
-- Настройки и справочники
-- ---------------------------------------------------------------------------

-- Одна строка на пользователя: id совпадает с auth.users.id (отношение 1:1).
create table public.user_settings (
  id uuid primary key,
  display_name text not null default '',
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  timezone text not null default 'auto',
  language text not null default 'ru',
  default_currency text not null default 'KZT',
  week_start smallint not null default 1 check (week_start in (1, 7)),
  idle_timeout_minutes integer not null default 30 check (idle_timeout_minutes between 1 and 1440),
  notification_settings jsonb not null default '{}',
  dashboard_layout jsonb not null default '{}',
  currencies jsonb not null default '[]',
  units jsonb not null default '{}'
);
select private.make_synced('user_settings');
alter table public.user_settings add constraint user_settings_id_is_user check (id = user_id);

create table public.categories (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 300),
  type text not null default 'general' check (type in ('general', 'goal', 'task', 'time', 'income', 'expense', 'note', 'life_area')),
  color text not null default '#6366f1',
  icon text not null default '',
  parent_id uuid references public.categories (id) on delete set null on update cascade,
  weekly_plan_minutes numeric check (weekly_plan_minutes >= 0)
);
select private.make_synced('categories');
create index categories_type_idx on public.categories (user_id, type);

create table public.tags (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 50),
  color text not null default '#64748b'
);
select private.make_synced('tags');

-- ---------------------------------------------------------------------------
-- Цели
-- ---------------------------------------------------------------------------

create table public.goals (
  id uuid primary key,
  category_id uuid references public.categories (id) on delete set null on update cascade,
  parent_goal_id uuid references public.goals (id) on delete set null on update cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '',
  goal_type text not null default 'numeric' check (goal_type in ('numeric', 'percent', 'milestones', 'date', 'composite')),
  target_value numeric,
  current_value numeric not null default 0,
  unit text not null default '',
  start_date date,
  deadline date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  progress_mode text not null default 'manual' check (progress_mode in ('manual', 'auto')),
  check (start_date is null or deadline is null or start_date <= deadline),
  check (goal_type <> 'numeric' or target_value > 0),
  check (goal_type <> 'percent' or current_value between 0 and 100),
  check (parent_goal_id is distinct from id)
);
select private.make_synced('goals');
create index goals_status_idx on public.goals (user_id, status);
create index goals_category_idx on public.goals (category_id);
create index goals_parent_idx on public.goals (parent_goal_id);

create table public.goal_milestones (
  id uuid primary key,
  goal_id uuid not null references public.goals (id) on delete cascade on update cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '',
  target_date date,
  completed_at timestamptz,
  sort_order integer not null default 0
);
select private.make_synced('goal_milestones');
create index goal_milestones_goal_idx on public.goal_milestones (goal_id);

-- ---------------------------------------------------------------------------
-- Привычки
-- ---------------------------------------------------------------------------

create table public.habits (
  id uuid primary key,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '',
  habit_type text not null default 'boolean' check (habit_type in ('boolean', 'numeric', 'duration', 'quantity', 'limit')),
  target_value numeric check (target_value >= 0),
  unit text not null default '',
  frequency text not null default 'daily' check (frequency in ('daily', 'weekdays', 'weekly_count', 'interval')),
  schedule_config jsonb not null default '{}',
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  check (end_date is null or start_date <= end_date),
  check (habit_type = 'boolean' or target_value is not null)
);
select private.make_synced('habits');

create table public.habit_logs (
  id uuid primary key,
  habit_id uuid not null references public.habits (id) on delete cascade on update cascade,
  log_date date not null,
  value numeric not null default 0 check (value >= 0),
  status text not null default 'done' check (status in ('done', 'partial', 'skipped', 'missed')),
  note text not null default '',
  -- Один результат привычки за день.
  constraint habit_logs_one_per_day unique (habit_id, log_date)
);
select private.make_synced('habit_logs');
create index habit_logs_date_idx on public.habit_logs (user_id, log_date);

-- ---------------------------------------------------------------------------
-- Проекты и задачи
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key,
  goal_id uuid references public.goals (id) on delete set null on update cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '',
  status text not null default 'active' check (status in ('planned', 'active', 'paused', 'completed', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  start_date date,
  deadline date,
  completed_at timestamptz,
  check (start_date is null or deadline is null or start_date <= deadline)
);
select private.make_synced('projects');
create index projects_status_idx on public.projects (user_id, status);
create index projects_goal_idx on public.projects (goal_id);

create table public.tasks (
  id uuid primary key,
  project_id uuid references public.projects (id) on delete set null on update cascade,
  goal_id uuid references public.goals (id) on delete set null on update cascade,
  parent_task_id uuid references public.tasks (id) on delete set null on update cascade,
  category_id uuid references public.categories (id) on delete set null on update cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  -- Срок хранится как календарная дата + необязательное локальное время:
  -- «сделать 10 ноября» не должно смещаться при смене часового пояса.
  due_date date,
  due_time text check (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  completed_at timestamptz,
  recurrence_rule jsonb,
  reminder_at timestamptz,
  sort_order integer not null default 0,
  search tsvector generated always as (to_tsvector('russian', coalesce(title, '') || ' ' || coalesce(description, ''))) stored,
  check (parent_task_id is distinct from id),
  check (recurrence_rule is null or due_date is not null)
);
select private.make_synced('tasks');
create index tasks_status_idx on public.tasks (user_id, status);
create index tasks_due_idx on public.tasks (user_id, due_date);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_goal_idx on public.tasks (goal_id);
create index tasks_parent_idx on public.tasks (parent_task_id);
create index tasks_category_idx on public.tasks (category_id);
create index tasks_search_idx on public.tasks using gin (search);

-- ---------------------------------------------------------------------------
-- Обучение
-- ---------------------------------------------------------------------------

create table public.courses (
  id uuid primary key,
  title text not null check (length(btrim(title)) between 1 and 300),
  platform text not null default '',
  url text not null default '' check (url = '' or url ~* '^https?://'),
  description text not null default '',
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'dropped')),
  progress numeric not null default 0 check (progress between 0 and 100),
  start_date date,
  end_date date,
  check (start_date is null or end_date is null or start_date <= end_date)
);
select private.make_synced('courses');
create index courses_status_idx on public.courses (user_id, status);

create table public.course_lessons (
  id uuid primary key,
  course_id uuid not null references public.courses (id) on delete cascade on update cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '',
  sort_order integer not null default 0,
  status text not null default 'todo' check (status in ('todo', 'done')),
  completed_at timestamptz
);
select private.make_synced('course_lessons');
create index course_lessons_course_idx on public.course_lessons (course_id);

create table public.books (
  id uuid primary key,
  title text not null check (length(btrim(title)) between 1 and 300),
  author text not null default '',
  total_pages integer check (total_pages >= 0),
  current_page integer not null default 0 check (current_page >= 0),
  status text not null default 'planned' check (status in ('planned', 'reading', 'finished', 'dropped')),
  rating smallint check (rating between 1 and 5),
  start_date date,
  finish_date date,
  notes text not null default '',
  check (total_pages is null or current_page <= total_pages),
  check (start_date is null or finish_date is null or start_date <= finish_date)
);
select private.make_synced('books');
create index books_status_idx on public.books (user_id, status);

create table public.skills (
  id uuid primary key,
  parent_skill_id uuid references public.skills (id) on delete set null on update cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  category text not null default '',
  description text not null default '',
  level smallint not null default 0 check (level between 0 and 10),
  status text not null default 'planned' check (status in ('planned', 'learning', 'mastered')),
  practice text not null default '',
  check (parent_skill_id is distinct from id)
);
select private.make_synced('skills');
create index skills_parent_idx on public.skills (parent_skill_id);

-- ---------------------------------------------------------------------------
-- Учёт времени
-- ---------------------------------------------------------------------------

create table public.time_entries (
  id uuid primary key,
  project_id uuid references public.projects (id) on delete set null on update cascade,
  task_id uuid references public.tasks (id) on delete set null on update cascade,
  category_id uuid references public.categories (id) on delete set null on update cascade,
  title text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  note text not null default '',
  check (ended_at is null or ended_at >= started_at)
);
select private.make_synced('time_entries');
-- Запрет нескольких одновременно запущенных таймеров у одного пользователя.
create unique index time_entries_one_active_idx on public.time_entries (user_id) where ended_at is null and deleted_at is null;
create index time_entries_started_idx on public.time_entries (user_id, started_at);
create index time_entries_project_idx on public.time_entries (project_id);
create index time_entries_task_idx on public.time_entries (task_id);
create index time_entries_category_idx on public.time_entries (category_id);

-- ---------------------------------------------------------------------------
-- Финансы
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 300),
  currency text not null check (currency ~ '^[A-Z0-9]{2,8}$'),
  account_type text not null default 'card' check (account_type in ('cash', 'card', 'bank', 'savings', 'other')),
  opening_balance numeric(28, 8) not null default 0,
  target_amount numeric(28, 8) check (target_amount > 0),
  is_active boolean not null default true
);
select private.make_synced('accounts');

create table public.transactions (
  id uuid primary key,
  -- Счёт с операциями нельзя удалить окончательно: сначала удаляются операции.
  account_id uuid not null references public.accounts (id) on delete no action on update cascade,
  transaction_type text not null check (transaction_type in ('income', 'expense', 'transfer')),
  category_id uuid references public.categories (id) on delete set null on update cascade,
  amount numeric(28, 8) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z0-9]{2,8}$'),
  transaction_date date not null,
  description text not null default '',
  to_account_id uuid references public.accounts (id) on delete no action on update cascade,
  to_amount numeric(28, 8) check (to_amount > 0),
  check ((transaction_type = 'transfer') = (to_account_id is not null)),
  check (to_account_id is distinct from account_id)
);
select private.make_synced('transactions');
create index transactions_date_idx on public.transactions (user_id, transaction_date);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id);
create index transactions_category_idx on public.transactions (category_id);

create table public.budgets (
  id uuid primary key,
  category_id uuid references public.categories (id) on delete set null on update cascade,
  name text not null default '',
  amount numeric(28, 8) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z0-9]{2,8}$'),
  period_type text not null default 'monthly' check (period_type in ('weekly', 'monthly', 'yearly', 'custom')),
  start_date date not null,
  end_date date,
  check (end_date is null or start_date <= end_date)
);
select private.make_synced('budgets');
create index budgets_category_idx on public.budgets (category_id);

-- ---------------------------------------------------------------------------
-- Здоровье
-- ---------------------------------------------------------------------------

create table public.custom_metrics (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 300),
  unit text not null default ''
);
select private.make_synced('custom_metrics');

create table public.health_records (
  id uuid primary key,
  metric_type text not null check (length(metric_type) between 1 and 64),
  value numeric not null check (value >= 0),
  unit text not null default '',
  recorded_at timestamptz not null,
  note text not null default ''
);
select private.make_synced('health_records');
create index health_records_recorded_idx on public.health_records (user_id, recorded_at);
create index health_records_metric_idx on public.health_records (user_id, metric_type, recorded_at);

-- ---------------------------------------------------------------------------
-- Знания, дневник, баланс, события
-- ---------------------------------------------------------------------------

create table public.notes (
  id uuid primary key,
  category_id uuid references public.categories (id) on delete set null on update cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  content text not null default '',
  content_format text not null default 'markdown' check (content_format in ('markdown', 'plain')),
  is_favorite boolean not null default false,
  search tsvector generated always as (to_tsvector('russian', coalesce(title, '') || ' ' || coalesce(content, ''))) stored
);
select private.make_synced('notes');
create index notes_category_idx on public.notes (category_id);
create index notes_search_idx on public.notes using gin (search);

create table public.journal_entries (
  id uuid primary key,
  entry_date date not null,
  title text not null default '',
  content text not null default '',
  mood smallint check (mood between 1 and 5),
  events text not null default '',
  achievements text not null default '',
  reflection text not null default '',
  tags jsonb not null default '[]'
);
select private.make_synced('journal_entries');
create index journal_entries_date_idx on public.journal_entries (user_id, entry_date);

-- Субъективные оценки сфер жизни хранятся отдельно от объективных показателей.
create table public.life_balance (
  id uuid primary key,
  category_id uuid not null references public.categories (id) on delete cascade on update cascade,
  score smallint not null check (score between 1 and 10),
  assessment_date date not null,
  note text not null default '',
  constraint life_balance_one_per_day unique (category_id, assessment_date)
);
select private.make_synced('life_balance');
create index life_balance_date_idx on public.life_balance (user_id, assessment_date);

create table public.events (
  id uuid primary key,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '',
  event_type text not null default 'personal' check (event_type in ('personal', 'workout', 'study')),
  start_date date not null,
  start_time text check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_date date,
  end_time text check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check (end_date is null or start_date <= end_date)
);
select private.make_synced('events');
create index events_start_idx on public.events (user_id, start_date);

-- Универсальная таблица связей «многие-ко-многим»: цель ↔ привычка, цель ↔ проект,
-- заметка ↔ тег, заметка ↔ заметка, проект ↔ заметка, курс ↔ навык и т. д.
-- Связь хранит только ссылки, исходные данные не дублируются.
create table public.entity_links (
  id uuid primary key,
  from_type text not null,
  from_id uuid not null,
  to_type text not null,
  to_id uuid not null
);
select private.make_synced('entity_links');
create unique index entity_links_unique_idx on public.entity_links (user_id, from_type, from_id, to_type, to_id);
create index entity_links_to_idx on public.entity_links (user_id, to_type, to_id);

create table public.saved_filters (
  id uuid primary key,
  module text not null,
  name text not null check (length(btrim(name)) between 1 and 300),
  config jsonb not null default '{}'
);
select private.make_synced('saved_filters');
create index saved_filters_module_idx on public.saved_filters (user_id, module);

-- ---------------------------------------------------------------------------
-- Полнотекстовый поиск по заметкам и задачам
-- ---------------------------------------------------------------------------

create or replace function public.search_content(q text)
returns table (entity_type text, entity_id uuid, title text, rank real)
language sql stable security invoker set search_path = '' as $$
  select 'notes', n.id, n.title, ts_rank(n.search, websearch_to_tsquery('russian', q))
  from public.notes n
  where n.deleted_at is null and n.search @@ websearch_to_tsquery('russian', q)
  union all
  select 'tasks', t.id, t.title, ts_rank(t.search, websearch_to_tsquery('russian', q))
  from public.tasks t
  where t.deleted_at is null and t.search @@ websearch_to_tsquery('russian', q)
  order by 4 desc
  limit 100
$$;
revoke all on function public.search_content(text) from public, anon;
grant execute on function public.search_content(text) to authenticated;

grant select on public.tombstones, public.audit_logs to authenticated;
revoke all on public.tombstones, public.audit_logs from anon;
