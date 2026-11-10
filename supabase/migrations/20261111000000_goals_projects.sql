-- Цели и проекты, связи с задачами. Доступ только владельцу строки (RLS).
create table public.goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  target_date date,
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  due_date date,
  goal_id uuid references public.goals (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

alter table public.tasks
  add constraint tasks_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete set null,
  add constraint tasks_goal_id_fkey
    foreign key (goal_id) references public.goals (id) on delete set null;

create index goals_user_server_updated_idx on public.goals (user_id, server_updated_at);
create index projects_user_server_updated_idx on public.projects (user_id, server_updated_at);
create index projects_goal_id_idx on public.projects (goal_id);
create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_goal_id_idx on public.tasks (goal_id);

create trigger goals_set_server_updated_at
  before insert or update on public.goals
  for each row execute function public.set_server_updated_at();
create trigger projects_set_server_updated_at
  before insert or update on public.projects
  for each row execute function public.set_server_updated_at();

alter table public.goals enable row level security;
alter table public.projects enable row level security;

create policy "goals_select_own" on public.goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals_insert_own" on public.goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goals_update_own" on public.goals
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goals_delete_own" on public.goals
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "projects_select_own" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "projects_insert_own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "projects_update_own" on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "projects_delete_own" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);
