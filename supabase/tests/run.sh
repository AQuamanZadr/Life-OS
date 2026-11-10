#!/usr/bin/env bash
# Проверка миграций: применение → тесты схемы → откат → повторное применение.
# Использование: PGURL=postgres://user:pass@host/postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN="${PGURL:-postgres:///postgres}"
DB="lifeos_migration_test_$$"
psql "$ADMIN" -qc "create database $DB"
trap 'psql "$ADMIN" -qc "drop database if exists $DB with (force)"' EXIT
URL="${ADMIN%/*}/$DB"
run() { psql "$URL" -q -v ON_ERROR_STOP=1 "$@"; }

echo "== окружение"
run -f tests/00_supabase_stub.sql
echo "== применение миграций"
for f in migrations/*.sql; do run -f "$f" >/dev/null; done
echo "== тесты схемы"
run -f tests/01_schema_test.sql 2>&1 | grep -E "ok —|ПРОВЕРК|ОЖИДАЛАСЬ|ERROR|ОШИБКА|ВСЕ ПРОВЕРКИ" | sed 's/^psql:[^ ]* NOTICE:  //'
echo "== откат"
for f in $(ls -r rollback/*.sql); do run -f "$f" >/dev/null 2>&1; done
LEFT=$(psql "$URL" -Atc "select count(*) from pg_tables where schemaname in ('public','private')")
[ "$LEFT" = "0" ] || { echo "после отката остались таблицы: $LEFT"; exit 1; }
echo "== повторное применение после отката"
for f in migrations/*.sql; do run -f "$f" >/dev/null; done
echo "МИГРАЦИИ ПРОВЕРЕНЫ"
