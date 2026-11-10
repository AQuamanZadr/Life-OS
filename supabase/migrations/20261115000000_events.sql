-- События календаря. Дата и время хранятся «как на часах», без часового пояса.
-- Доступ только владельцу строки (RLS).
create table public.events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  date date not null,
  start_time text check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  check (end_time is null or (start_time is not null and end_time > start_time))
);

create index events_user_server_updated_idx on public.events (user_id, server_updated_at);

create trigger events_set_server_updated_at
  before insert or update on public.events
  for each row execute function public.set_server_updated_at();

alter table public.events enable row level security;

create policy "events_select_own" on public.events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "events_insert_own" on public.events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "events_update_own" on public.events
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "events_delete_own" on public.events
  for delete to authenticated using ((select auth.uid()) = user_id);
