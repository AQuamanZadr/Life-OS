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
- Задачи: добавление, изменение, удаление (мягкое), выполнение, поиск, фильтры; привязка к проекту и цели
- Проекты: CRUD, поиск, фильтр по статусу, привязка к цели, прогресс по задачам
- Цели: CRUD, поиск, фильтр по статусу, ручной прогресс, счётчики проектов и задач
- Привычки: CRUD, расписание по дням недели, отметки за последние 7 дней, серия, % за 30 дней, архив (`habits` + `habit_logs`; id отметки вычисляется из привычки и даты)
- Финансы: операции (доход/расход), суммы в копейках (`lib/money.ts`), итоги за месяц, расходы по категориям, график за 6 месяцев (Recharts), поиск, фильтр; защита от дублей (id формы + предупреждение о такой же операции)
- Настройки (`/settings`, ссылка внизу меню): резервная копия (скачать JSON, восстановить из файла с проверкой записей и ссылок) и смена пароля
- Удаление проекта/цели отвязывает связанные записи, а не удаляет их
- Главная: сводка по задачам; быстрое добавление задачи из шапки
- Вход: Supabase Auth, `src/proxy.ts` закрывает все страницы, `/login`, выход (чистит локальные данные)
- Синхронизация (`src/lib/sync/`): запись сначала в Dexie + очередь `outbox`, затем pull → push в Supabase; конфликт — побеждает более поздний `updatedAt`; курсор по `server_updated_at`

## Не сделано
Остальные разделы (Календарь, Обучение, Время, Здоровье, Знания, Дневник, Баланс, Аналитика), PWA/офлайн-оболочка, очистка давно удалённых строк.

## Важно
- Настройки — `.env.local` (образец `.env.example`); в репозиторий не попадает. При деплое задать те же переменные.
- `NEXT_PUBLIC_LOCAL_ONLY=1` — только для e2e: без входа и облака.
- cacheComponents: `new Date()` нельзя вызывать при рендере — использовать `useToday()` или эффекты.
- Новая синхронизируемая таблица: версия в `db.ts` + `syncedTables`, схема в `schemas` (`sync/engine.ts`), запись через `markDirty` + `requestSync`, миграция с `server_updated_at`, триггером и RLS.
- В облачной песочнице сервер ходит в сеть через прокси: `NODE_USE_ENV_PROXY=1 npx next start`; Chromium — с `proxy: { server: HTTPS_PROXY }`.
- Общие кирпичи раздела: `lib/schema.ts` (поля Zod), `lib/repo.ts` (insertRow/patchRow/removeRow), `lib/use-rows.ts`, `components/list-toolbar.tsx`, `confirm-dialog.tsx`, `ui/field.tsx`, `ui/progress.tsx`.
- Вход, смена пароля и синхронизация всех шести таблиц проверены вживую на базе владельца; все миграции из `supabase/migrations/` применены.
- Новая синхронизируемая таблица автоматически попадает в резервную копию; ссылки между таблицами добавлять в `links` (`features/settings/backup.ts`).
- Графики: цвета только из `--chart-1/2` (проверены валидатором dataviz); новые цвета серий — проверять им же. Валюта одна — ₽.

## Команды
`npm run dev` · `build` · `lint` · `typecheck` · `test` (Vitest) · `test:e2e` (Playwright)

## Следующий шаг
«Учёт времени» (связь с задачами и проектами). Затем Календарь, Здоровье, Дневник, Знания, Обучение, Баланс, Аналитика, PWA.

## Известные ошибки
Нет.
