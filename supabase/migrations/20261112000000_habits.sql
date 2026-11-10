-- Привычки и отметки по дням. Доступ только владельцу строки (RLS).
create table public.habits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  status text not null default 'active' check (status in ('active', 'archived')),
  weekdays smallint[] not null
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.habit_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  done boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (habit_id, date)
);

create index habits_user_server_updated_idx on public.habits (user_id, server_updated_at);
create index habit_logs_user_server_updated_idx on public.habit_logs (user_id, server_updated_at);

create trigger habits_set_server_updated_at
  before insert or update on public.habits
  for each row execute function public.set_server_updated_at();
create trigger habit_logs_set_server_updated_at
  before insert or update on public.habit_logs
  for each row execute function public.set_server_updated_at();

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

create policy "habits_select_own" on public.habits
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "habits_insert_own" on public.habits
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habits_update_own" on public.habits
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habits_delete_own" on public.habits
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "habit_logs_select_own" on public.habit_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "habit_logs_insert_own" on public.habit_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habit_logs_update_own" on public.habit_logs
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit_logs_delete_own" on public.habit_logs
  for delete to authenticated using ((select auth.uid()) = user_id);
