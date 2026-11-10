#!/usr/bin/env bash
# Интеграционные тесты синхронизации на настоящем PostgreSQL + PostgREST
# (тот же REST-слой, что использует Supabase).
#
# Требуется: psql с правами суперпользователя (PGURL) и запущенный либо
# доступный бинарник PostgREST (POSTGREST_BIN). Запускается в CI.
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN="${PGURL:-postgres:///postgres}"
POSTGREST_BIN="${POSTGREST_BIN:-postgrest}"
PORT="${PGRST_PORT:-3999}"
DB="lifeos_integration_$$"
SECRET="integration-test-secret-at-least-32-chars-long"
HOSTPORT="${PGHOSTPORT:-localhost:5432}"

psql "$ADMIN" -qc "create database $DB"
cleanup() {
  [ -n "${PGRST_PID:-}" ] && kill "$PGRST_PID" 2>/dev/null || true
  psql "$ADMIN" -qc "drop database if exists $DB with (force)" || true
}
trap cleanup EXIT
URL="${ADMIN%/*}/$DB"
psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
psql "$URL" -q -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select from pg_roles where rolname = 'lifeos_authenticator') then
    create role lifeos_authenticator login noinherit password 'integration';
  end if;
end \$\$;
grant anon, authenticated to lifeos_authenticator;
insert into auth.users (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
SQL

PGRST_DB_URI="postgres://lifeos_authenticator:integration@$HOSTPORT/$DB" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT="$PORT" \
  "$POSTGREST_BIN" >/tmp/postgrest-$$.log 2>&1 &
PGRST_PID=$!
for i in $(seq 1 50); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.2; done

PGRST_URL="http://localhost:$PORT" PGRST_JWT_SECRET="$SECRET" npx vitest run --config vitest.integration.config.mts "$@"
