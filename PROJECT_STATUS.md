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
- Задачи: добавление, изменение, удаление (мягкое), выполнение, поиск, фильтры; хранение в IndexedDB
- Главная: сводка по задачам; быстрое добавление задачи из шапки

## Не сделано
Вход (Supabase Auth), синхронизация с Supabase, остальные разделы, связи задач с проектами/целями (поля `projectId`/`goalId` есть), PWA, экспорт/восстановление.

## Важно
- Данные пока только в браузере (IndexedDB) — до синхронизации не переживут очистку данных сайта.
- cacheComponents: `new Date()` нельзя вызывать при рендере — использовать `useToday()` или эффекты.
- Новые таблицы: добавлять версию в `db.ts` и миграцию в `supabase/migrations/`.

## Команды
`npm run dev` · `build` · `lint` · `typecheck` · `test` (Vitest) · `test:e2e` (Playwright)

## Следующий шаг
Вход через Supabase Auth + синхронизация задач. Нужен publishable key проекта (URL уже есть: qgeeitoloffelzfygujz.supabase.co) и применённая миграция. Затем разделы «Проекты» и «Цели» со связями.

## Известные ошибки
Нет.
