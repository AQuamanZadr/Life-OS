# LIFE OS — состояние проекта

## Стек
Next.js 16 (App Router, Turbopack, cacheComponents), React 19, TypeScript, Tailwind 4.
UI в стиле shadcn/ui, написан вручную (реестр ui.shadcn.com недоступен из облачной среды).
Перед правками Next-кода сверяться с `node_modules/next/dist/docs/` (см. AGENTS.md).

## Структура
- `src/app/layout.tsx` — корневой layout (ru, шрифт Geist с кириллицей)
- `src/app/(app)/layout.tsx` — оболочка: Sidebar + Header
- `src/app/(app)/page.tsx` — Главная
- `src/app/(app)/[section]/page.tsx` — временная заглушка нереализованных разделов
- `src/lib/nav.ts` — список разделов (единый источник для меню, поиска, главной)
- `src/components/ui/` — button, card, input, sheet
- `src/components/layout/` — sidebar, header, mobile-nav, search, page-header
- `src/app/globals.css` — цветовые токены темы

## Готово
- Каркас, Sidebar, Header, мобильное меню, поиск по разделам
- Главная: карточки разделов без данных

## Не сделано
Supabase (Auth, RLS, схема), Dexie, все разделы, синхронизация, PWA, экспорт, тесты (Vitest/Playwright не установлены).

## Команды
`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`

## Следующий шаг
Supabase: схема + RLS + вход (нужны URL и publishable key проекта от владельца). Затем раздел «Задачи».

## Известные ошибки
Нет.
