-- Записи учёта времени. ended_at пуст, пока таймер идёт. Доступ только владельцу строки (RLS).
create table public.time_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz check (ended_at is null or (ended_at > started_at and ended_at <= started_at + interval '24 hours')),
  task_id uuid references public.tasks (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create index time_entries_user_server_updated_idx
  on public.time_entries (user_id, server_updated_at);
create index time_entries_task_id_idx on public.time_entries (task_id);
create index time_entries_project_id_idx on public.time_entries (project_id);

create trigger time_entries_set_server_updated_at
  before insert or update on public.time_entries
  for each row execute function public.set_server_updated_at();

alter table public.time_entries enable row level security;

create policy "time_entries_select_own" on public.time_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "time_entries_insert_own" on public.time_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "time_entries_update_own" on public.time_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "time_entries_delete_own" on public.time_entries
  for delete to authenticated using ((select auth.uid()) = user_id);
