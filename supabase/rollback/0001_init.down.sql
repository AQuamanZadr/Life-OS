-- Откат миграции 0001_init. ВНИМАНИЕ: удаляет все данные Life OS.
-- Перед выполнением сделайте резервную копию (Настройки → Резервные копии).
drop function if exists public.search_content(text);
drop table if exists
  public.saved_filters, public.entity_links, public.events, public.life_balance, public.journal_entries,
  public.notes, public.health_records, public.custom_metrics, public.budgets, public.transactions,
  public.accounts, public.time_entries, public.skills, public.books, public.course_lessons, public.courses,
  public.tasks, public.projects, public.habit_logs, public.habits, public.goal_milestones, public.goals,
  public.tags, public.categories, public.user_settings, public.audit_logs, public.tombstones cascade;
drop function if exists private.make_synced(text);
drop function if exists private.log_change();
drop function if exists private.touch_row();
drop schema if exists private;
