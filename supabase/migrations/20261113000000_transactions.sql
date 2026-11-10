-- Финансовые операции. Сумма — целое число копеек. Доступ только владельцу строки (RLS).
-- id создаётся на устройстве, поэтому повторная отправка той же операции не создаёт дубль.
create table public.transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income')),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 1000000000000),
  date date not null,
  category text not null check (char_length(category) between 1 and 50),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create index transactions_user_server_updated_idx
  on public.transactions (user_id, server_updated_at);

create trigger transactions_set_server_updated_at
  before insert or update on public.transactions
  for each row execute function public.set_server_updated_at();

alter table public.transactions enable row level security;

create policy "transactions_select_own" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);
