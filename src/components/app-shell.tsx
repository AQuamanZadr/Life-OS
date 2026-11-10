"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Cloud, CloudOff, HardDrive, Lock, Menu as MenuIcon, RefreshCw, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NAV } from "@/components/nav";
import { QuickAdd } from "@/components/quick-add";
import { Button, ConfirmProvider, ToastProvider, useToast } from "@/components/ui";
import { AuthProvider, useAuth } from "@/core/auth/AuthProvider";
import { LoginScreen } from "@/core/auth/LoginScreen";
import { getDb } from "@/core/db/db";
import { newId } from "@/core/lib/ids";
import { nowIso } from "@/core/lib/dates";
import { ensureSeed, useSettings } from "@/core/settings";
import { SyncProvider, useSync } from "@/core/sync/SyncProvider";
import { cn } from "@/lib/cn";
import { useLiveQuery } from "dexie-react-hooks";

function SyncBadge() {
  const sync = useSync();
  const map = {
    local: { icon: HardDrive, text: "Локальный режим", tone: "text-muted" },
    idle: { icon: Cloud, text: sync.pending ? `Ожидает отправки: ${sync.pending}` : "Синхронизировано", tone: "text-success" },
    syncing: { icon: RefreshCw, text: "Синхронизация…", tone: "text-primary" },
    offline: { icon: CloudOff, text: sync.pending ? `Нет сети · не отправлено: ${sync.pending}` : "Нет сети", tone: "text-warning" },
    error: { icon: AlertTriangle, text: "Ошибка синхронизации", tone: "text-danger" },
  } as const;
  const problem = sync.conflicts > 0 || sync.failed > 0;
  const s = problem ? { icon: AlertTriangle, text: sync.conflicts ? `Конфликты: ${sync.conflicts}` : `Отклонено сервером: ${sync.failed}`, tone: "text-danger" } : map[sync.status];
  const Icon = s.icon;
  return (
    <Link href="/settings?tab=sync" data-testid="sync-status" data-status={sync.status} data-pending={sync.pending} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-subtle", s.tone)} title={sync.lastError ?? s.text}>
      <Icon size={15} className={cn(sync.status === "syncing" && !problem && "animate-spin")} />
      <span className="truncate">{s.text}</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основное меню" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-primary-soft text-primary" : "text-fg hover:bg-subtle")}>
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Напоминания о задачах: показываются, пока приложение открыто. */
function Reminders() {
  const toast = useToast();
  const settings = useSettings();
  const tasks = useLiveQuery(() => getDb().tasks.filter((t) => !!t.reminder_at && !t.deleted_at && t.status !== "done" && t.status !== "cancelled").toArray(), []);
  useEffect(() => {
    if (!tasks?.length) return;
    const check = () => {
      const shown: string[] = JSON.parse(sessionStorage.getItem("lifeos.reminders") ?? "[]");
      for (const t of tasks) {
        const key = `${t.id}:${t.reminder_at}`;
        const at = Date.parse(t.reminder_at!);
        if (at <= Date.now() && Date.now() - at < 24 * 3600_000 && !shown.includes(key)) {
          shown.push(key);
          toast(`Напоминание: ${t.title}`, "info");
          if (settings.notification_settings.task_reminders && typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Life OS", { body: t.title });
        }
      }
      sessionStorage.setItem("lifeos.reminders", JSON.stringify(shown.slice(-200)));
    };
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [tasks, toast, settings.notification_settings.task_reminders]);
  return null;
}

function ThemeSync() {
  const { theme } = useSettings();
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      try {
        localStorage.setItem("lifeos.theme", theme);
      } catch {
        /* хранилище недоступно */
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return null;
}

/** Журнал ошибок: необработанные исключения сохраняются локально (Настройки → Управление данными). */
function ErrorLogger() {
  useEffect(() => {
    const save = (source: string, message: string, stack: string | null) => {
      void getDb()
        .error_logs.add({ id: newId(), occurred_at: nowIso(), source, message: message.slice(0, 1000), stack: stack?.slice(0, 4000) ?? null })
        .then(async () => {
          const count = await getDb().error_logs.count();
          if (count > 200) {
            const old = await getDb().error_logs.orderBy("occurred_at").limit(count - 200).primaryKeys();
            await getDb().error_logs.bulkDelete(old);
          }
        })
        .catch(() => {});
    };
    const onError = (e: ErrorEvent) => save("window", e.message, e.error?.stack ?? null);
    const onRejection = (e: PromiseRejectionEvent) => save("promise", String(e.reason?.message ?? e.reason), e.reason?.stack ?? null);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

function Shell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (auth.status === "ready") void ensureSeed();
  }, [auth.status]);

  if (auth.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted" role="status">
        Загрузка…
      </div>
    );
  }
  if (auth.status !== "ready") return <LoginScreen />;

  const footer = (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <SyncBadge />
      <button type="button" onClick={() => void auth.lock()} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted hover:bg-subtle">
        <Lock size={15} /> Выйти{auth.login ? ` (${auth.login})` : ""}
      </button>
    </div>
  );

  return (
    <SyncProvider>
      <Reminders />
      <div className="flex min-h-dvh">
        <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card p-3 md:flex">
          <Link href="/dashboard" className="px-3 pt-1 text-lg font-bold tracking-tight">
            Life OS
          </Link>
          <div className="flex-1">
            <NavLinks />
          </div>
          {footer}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 md:hidden">
            <Button variant="ghost" size="icon" aria-label="Открыть меню" onClick={() => setDrawer(true)}>
              <MenuIcon size={20} />
            </Button>
            <Link href="/dashboard" className="font-bold">
              Life OS
            </Link>
            <div className="max-w-[55%]">
              <SyncBadge />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-24 pt-4 sm:px-6 sm:pt-6">{children}</main>
        </div>
      </div>

      {drawer && (
        <div className="no-print fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Меню">
          <button type="button" aria-label="Закрыть меню" className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="relative flex h-full w-72 max-w-[85%] flex-col gap-3 overflow-y-auto bg-card p-3 shadow-xl">
            <div className="flex items-center justify-between px-2">
              <span className="text-lg font-bold">Life OS</span>
              <Button variant="ghost" size="icon" aria-label="Закрыть меню" onClick={() => setDrawer(false)}>
                <X size={18} />
              </Button>
            </div>
            <div className="flex-1">
              <NavLinks onNavigate={() => setDrawer(false)} />
            </div>
            {footer}
          </div>
        </div>
      )}
      <QuickAdd />
    </SyncProvider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <ThemeSync />
          <ErrorLogger />
          <ServiceWorker />
          <Shell>{children}</Shell>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
