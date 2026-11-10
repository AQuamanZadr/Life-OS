-- Задачи. Доступ только владельцу строки (RLS).
create table public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  project_id uuid,
  goal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index tasks_user_updated_idx on public.tasks (user_id, updated_at);

alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);
