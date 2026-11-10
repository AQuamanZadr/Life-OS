# LIFE OS — состояние проекта

## Стек
Next.js 16 (App Router, Turbopack, cacheComponents), React 19, TypeScript, Tailwind 4.
UI в стиле shadcn/ui, написан вручную (реестр ui.shadcn.com недоступен из облачной среды).
Перед правками Next-кода сверяться с `node_modules/next/dist/docs/` (см. AGENTS.md).

## Структура
- `src/app/layout.tsx` — корневой layout (ru, шрифт Geist с кириллицей)
- `src/app/(app)/layout.tsx` — оболочка: Sidebar + Header
- `src/app/(app)/page.tsx` — Главная; сводки разделов подключаются в `summaries`
- `src/app/(app)/[section]/page.tsx` — заглушка для разделов без `ready` в `nav.ts`
- `src/lib/nav.ts` — список разделов (меню, поиск, главная); `ready: true` — у раздела своя страница
- `src/lib/db.ts` — Dexie (IndexedDB), версии схемы локальной базы
- `src/lib/dates.ts`, `use-today.ts` — даты: календарные `YYYY-MM-DD` (местные), моменты — ISO UTC
- `src/features/<раздел>/` — schema (Zod), repo (запись в Dexie), filter, компоненты
- `src/components/ui/` — button, card, input, textarea, select, label, badge, dialog, sheet
- `src/components/layout/` — sidebar, header, mobile-nav, search, quick-add, page-header
- `supabase/migrations/` — SQL-схема с RLS (в проект Supabase ещё не применена)
- `e2e/` — Playwright; `src/**/*.test.ts` — Vitest

## Готово
- Каркас, Sidebar, Header, мобильное меню, поиск по разделам
- Задачи: добавление, изменение, удаление (мягкое), выполнение, поиск, фильтры
- Главная: сводка по задачам; быстрое добавление задачи из шапки
- Вход: Supabase Auth, `src/proxy.ts` закрывает все страницы, `/login`, выход (чистит локальные данные)
- Синхронизация (`src/lib/sync/`): запись сначала в Dexie + очередь `outbox`, затем pull → push в Supabase; конфликт — побеждает более поздний `updatedAt`; курсор по `server_updated_at`

## Не сделано
Остальные разделы, связи задач с проектами/целями (поля `projectId`/`goalId` есть), PWA/офлайн-оболочка, экспорт/восстановление, очистка давно удалённых строк.

## Важно
- Настройки — `.env.local` (образец `.env.example`); в репозиторий не попадает. При деплое задать те же переменные.
- `NEXT_PUBLIC_LOCAL_ONLY=1` — только для e2e: без входа и облака.
- cacheComponents: `new Date()` нельзя вызывать при рендере — использовать `useToday()` или эффекты.
- Новая синхронизируемая таблица: версия в `db.ts` + `syncedTables`, схема в `schemas` (`sync/engine.ts`), запись через `markDirty` + `requestSync`, миграция с `server_updated_at`, триггером и RLS.
- В облачной песочнице сервер ходит в сеть через прокси: `NODE_USE_ENV_PROXY=1 npx next start`; Chromium — с `proxy: { server: HTTPS_PROXY }`.
- Вход проверен вживую. Синхронизация с настоящей базой НЕ проверена: ждёт применения миграции владельцем.

## Команды
`npm run dev` · `build` · `lint` · `typecheck` · `test` (Vitest) · `test:e2e` (Playwright)

## Следующий шаг
После применения миграции — проверить синхронизацию вживую (два браузера). Затем «Проекты» и «Цели» со связями с задачами.

## Известные ошибки
Нет.
