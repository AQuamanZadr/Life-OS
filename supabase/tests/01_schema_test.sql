-- Проверки схемы: RLS, версии, ограничения целостности, tombstones.
-- Любая неудачная проверка прерывает выполнение с ошибкой.
\set ON_ERROR_STOP on

insert into auth.users (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok — % (%)', label, sqlstate;
    return;
  end;
  raise exception 'ОЖИДАЛАСЬ ОШИБКА: %', label;
end $$;

create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ПРОВЕРКА НЕ ПРОШЛА: %', label; end if;
  raise notice 'ok — %', label;
end $$;

-- ---------- Пользователь A ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

insert into public.accounts (id, name, currency, opening_balance) values ('10000000-0000-4000-8000-000000000001', 'Карта', 'KZT', 1000);
insert into public.transactions (id, account_id, transaction_type, amount, currency, transaction_date)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'expense', 0.10, 'KZT', '2026-11-10');
insert into public.transactions (id, account_id, transaction_type, amount, currency, transaction_date)
values ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'expense', 0.20, 'KZT', '2026-11-10');

select pg_temp.expect((select sum(amount) from public.transactions) = 0.30, 'NUMERIC: 0.10 + 0.20 = 0.30 точно');
select pg_temp.expect((select amount::text from public.transactions where id = '20000000-0000-4000-8000-000000000001') = '0.10000000', 'сумма читается как точный текст');
select pg_temp.expect((select version from public.accounts) = 1, 'версия новой строки = 1');
select pg_temp.expect((select user_id from public.accounts) = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user_id проставлен сервером');

-- Версионирование и optimistic concurrency
update public.accounts set name = 'Карта 2', version = 999 where id = '10000000-0000-4000-8000-000000000001' and version = 1;
select pg_temp.expect((select version from public.accounts) = 2, 'версия увеличивается на сервере, подделать нельзя');
with u as (update public.accounts set name = 'устаревшее' where id = '10000000-0000-4000-8000-000000000001' and version = 1 returning 1)
select pg_temp.expect((select count(*) from u) = 0, 'обновление с устаревшей версией не затрагивает строк');
select pg_temp.expect((select name from public.accounts) = 'Карта 2', 'данные не перезаписаны устаревшим изменением');

-- Идемпотентность: повторная вставка той же операции
select pg_temp.expect_error($$insert into public.transactions (id, account_id, transaction_type, amount, currency, transaction_date)
  values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'expense', 0.10, 'KZT', '2026-11-10')$$, 'повторная вставка операции с тем же id отклонена');
select pg_temp.expect((select count(*) from public.transactions) = 2, 'дубль финансовой операции не создан');

-- Ограничения целостности
select pg_temp.expect_error($$insert into public.transactions (id, account_id, transaction_type, amount, currency, transaction_date) values (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'expense', 0, 'KZT', '2026-11-10')$$, 'нулевая сумма запрещена');
select pg_temp.expect_error($$insert into public.transactions (id, account_id, transaction_type, amount, currency, transaction_date) values (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'expense', -5, 'KZT', '2026-11-10')$$, 'отрицательная сумма запрещена');
select pg_temp.expect_error($$insert into public.transactions (id, account_id, transaction_type, amount, currency, transaction_date) values (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'transfer', 5, 'KZT', '2026-11-10')$$, 'перевод без счёта зачисления запрещён');
select pg_temp.expect_error($$insert into public.transactions (id, account_id, transaction_type, amount, currency, transaction_date) values (gen_random_uuid(), gen_random_uuid(), 'expense', 5, 'KZT', '2026-11-10')$$, 'операция по несуществующему счёту запрещена');
select pg_temp.expect_error($$insert into public.transactions (id, account_id, transaction_type, amount, currency, transaction_date) values (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'expense', 5, 'KZT', '2026-02-30')$$, 'несуществующая дата запрещена');
select pg_temp.expect_error($$delete from public.accounts where id = '10000000-0000-4000-8000-000000000001'$$, 'счёт с операциями нельзя удалить');
select pg_temp.expect_error($$insert into public.goals (id, title, goal_type, target_value) values (gen_random_uuid(), 'x', 'numeric', 0)$$, 'числовая цель требует целевое значение > 0');
select pg_temp.expect_error($$insert into public.goals (id, title, goal_type, start_date, deadline) values (gen_random_uuid(), 'x', 'percent', '2026-02-01', '2026-01-01')$$, 'срок раньше начала запрещён');
select pg_temp.expect_error($$insert into public.tasks (id, title) values (gen_random_uuid(), '   ')$$, 'пустое название запрещено');

-- Один активный таймер
insert into public.time_entries (id, started_at) values ('30000000-0000-4000-8000-000000000001', now());
select pg_temp.expect_error($$insert into public.time_entries (id, started_at) values (gen_random_uuid(), now())$$, 'второй активный таймер запрещён');
update public.time_entries set ended_at = now() + interval '1 hour', duration_seconds = 3600 where id = '30000000-0000-4000-8000-000000000001';
insert into public.time_entries (id, started_at) values ('30000000-0000-4000-8000-000000000002', now());
select pg_temp.expect((select count(*) from public.time_entries) = 2, 'после остановки можно запустить новый таймер');

-- Одна запись привычки в день
insert into public.habits (id, title, start_date) values ('40000000-0000-4000-8000-000000000001', 'Зарядка', '2026-01-01');
insert into public.habit_logs (id, habit_id, log_date, value) values (gen_random_uuid(), '40000000-0000-4000-8000-000000000001', '2026-11-10', 1);
select pg_temp.expect_error($$insert into public.habit_logs (id, habit_id, log_date, value) values (gen_random_uuid(), '40000000-0000-4000-8000-000000000001', '2026-11-10', 1)$$, 'вторая запись привычки за день запрещена');

-- Каскады и tombstones
insert into public.goals (id, title, goal_type) values ('50000000-0000-4000-8000-000000000001', 'Цель', 'milestones');
insert into public.goal_milestones (id, goal_id, title) values (gen_random_uuid(), '50000000-0000-4000-8000-000000000001', 'Этап');
insert into public.tasks (id, title, goal_id, description) values ('60000000-0000-4000-8000-000000000001', 'Купить книги', '50000000-0000-4000-8000-000000000001', 'по программированию');
delete from public.goals where id = '50000000-0000-4000-8000-000000000001';
select pg_temp.expect((select count(*) from public.goal_milestones) = 0, 'этапы удалены каскадно');
select pg_temp.expect((select goal_id from public.tasks where id = '60000000-0000-4000-8000-000000000001') is null, 'ссылка задачи на цель обнулена');
select pg_temp.expect((select count(*) from public.tombstones where entity_type = 'goals') = 1, 'tombstone создан для цели');
select pg_temp.expect((select count(*) from public.tombstones where entity_type = 'goal_milestones') = 1, 'tombstone создан для этапа');

-- Полнотекстовый поиск
select pg_temp.expect((select count(*) from public.search_content('книга')) = 1, 'поиск учитывает русскую морфологию');
select pg_temp.expect((select count(*) from public.search_content('программирование')) = 1, 'поиск по описанию');

-- Журнал изменений
select pg_temp.expect((select count(*) from public.audit_logs where entity_type = 'accounts' and action = 'update' and change_summary = 'name') = 1, 'журнал фиксирует изменённые поля');
select pg_temp.expect_error($$insert into public.audit_logs (user_id, entity_type, entity_id, action) values (auth.uid(), 'x', gen_random_uuid(), 'insert')$$, 'клиент не может писать в журнал');
select pg_temp.expect_error($$delete from public.tombstones$$, 'клиент не может удалять tombstones');

-- Настройки: одна строка на пользователя
insert into public.user_settings (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect_error($$insert into public.user_settings (id) values (gen_random_uuid())$$, 'вторая строка настроек запрещена');

-- ---------- Пользователь B: изоляция ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
select pg_temp.expect((select count(*) from public.accounts) = 0, 'B не видит счета A');
select pg_temp.expect((select count(*) from public.transactions) = 0, 'B не видит операции A');
select pg_temp.expect((select count(*) from public.tasks) = 0, 'B не видит задачи A');
select pg_temp.expect((select count(*) from public.audit_logs) = 0, 'B не видит журнал A');
select pg_temp.expect((select count(*) from public.tombstones) = 0, 'B не видит tombstones A');
select pg_temp.expect((select count(*) from public.search_content('книга')) = 0, 'поиск B не находит данные A');
with u as (update public.accounts set name = 'взлом' returning 1) select pg_temp.expect((select count(*) from u) = 0, 'B не может изменить данные A');
with d as (delete from public.tasks returning 1) select pg_temp.expect((select count(*) from d) = 0, 'B не может удалить данные A');
insert into public.tasks (id, title, user_id) values ('60000000-0000-4000-8000-0000000000b1', 'чужая', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.expect((select user_id from public.tasks where id = '60000000-0000-4000-8000-0000000000b1') = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'нельзя создать запись от имени другого пользователя');
select pg_temp.expect_error($$insert into public.tasks (id, title) values ('60000000-0000-4000-8000-000000000001', 'перехват id')$$, 'нельзя занять id чужой записи');

-- ---------- Без авторизации ----------
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect((select count(*) from public.tasks) = 0, 'без сессии данные не видны');
select pg_temp.expect_error($$insert into public.tasks (id, title) values (gen_random_uuid(), 'аноним')$$, 'без сессии запись запрещена');
set role anon;
select pg_temp.expect_error($$select count(*) from public.tasks$$, 'роль anon не имеет доступа к таблицам');
select pg_temp.expect_error($$select count(*) from public.transactions$$, 'роль anon не имеет доступа к финансам');
select pg_temp.expect_error($$select count(*) from public.health_records$$, 'роль anon не имеет доступа к здоровью');
select pg_temp.expect_error($$select * from public.search_content('x')$$, 'роль anon не может выполнять поиск');
reset role;

-- Каждая таблица public защищена RLS
select pg_temp.expect(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0,
  'RLS включён на всех таблицах public');

-- Удаление пользователя удаляет все его данные
delete from auth.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select pg_temp.expect((select count(*) from public.tasks where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0, 'данные удалённого пользователя удалены');

delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.expect((select count(*) from public.transactions) = 0 and (select count(*) from public.accounts) = 0, 'удаление владельца удаляет счета вместе с операциями');

\echo 'ВСЕ ПРОВЕРКИ СХЕМЫ ПРОЙДЕНЫ'
