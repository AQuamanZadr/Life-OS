"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { getDb } from "../db/db";
import { useToast } from "@/components/ui";
import { syncNow, type SyncResult } from "./engine";
import { getSupabase, SupabaseRemote } from "./supabase";
import { runAutoBackup } from "../backup/backup";

export type SyncStatus = "local" | "idle" | "syncing" | "offline" | "error";

interface SyncApi {
  status: SyncStatus;
  /** Несинхронизированные изменения. */
  pending: number;
  conflicts: number;
  failed: number;
  online: boolean;
  lastError: string | null;
  sync(): Promise<SyncResult | null>;
}

const SyncContext = createContext<SyncApi>({ status: "local", pending: 0, conflicts: 0, failed: 0, online: true, lastError: null, sync: async () => null });

export function useSync(): SyncApi {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const toast = useToast();
  const [online, setOnline] = useState(true);
  const [phase, setPhase] = useState<"idle" | "syncing" | "offline" | "error">("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const wasOffline = useRef(false);
  const cloud = auth.mode === "cloud" && auth.status === "ready" && !!auth.userId;

  const counts = useLiveQuery(async () => {
    const ops = await getDb().sync_operations.toArray();
    return {
      pending: ops.filter((o) => o.status === "pending" || o.status === "in_flight").length,
      failed: ops.filter((o) => o.status === "failed").length,
      conflicts: await getDb().sync_conflicts.count(),
    };
  }, []);
  const pending = counts?.pending ?? 0;

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const sync = useCallback(async (): Promise<SyncResult | null> => {
    if (!cloud) return null;
    const supabase = getSupabase();
    if (!supabase || !auth.userId) return null;
    if (!navigator.onLine) {
      wasOffline.current = true;
      setPhase("offline");
      return null;
    }
    setPhase("syncing");
    const result = await syncNow(new SupabaseRemote(supabase, auth.userId));
    if (result.offline) {
      wasOffline.current = true;
      setPhase("offline");
    } else if (result.error) {
      setPhase("error");
      setLastError(result.error);
    } else {
      setPhase("idle");
      setLastError(null);
      if (result.conflicts > 0) toast(`Синхронизация: обнаружены конфликты (${result.conflicts}). Откройте Настройки → Синхронизация.`, "error");
      else if (result.failed > 0) toast(`Сервер отклонил изменения (${result.failed}). Подробности — в настройках синхронизации.`, "error");
      else if (wasOffline.current && result.pushed > 0) toast(`Соединение восстановлено. Синхронизировано изменений: ${result.pushed}.`, "success");
      wasOffline.current = false;
    }
    return result;
  }, [cloud, auth.userId, toast]);

  // Запуск: при входе, при появлении сети, при возврате на вкладку и раз в 5 минут.
  useEffect(() => {
    if (!cloud) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sync();
    const onVisible = () => document.visibilityState === "visible" && void sync();
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void sync(), 5 * 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [cloud, sync]);

  // После локальных изменений — отложенная отправка.
  useEffect(() => {
    if (!cloud || pending === 0 || !online) return;
    const t = setTimeout(() => void sync(), 2500);
    return () => clearTimeout(t);
  }, [cloud, pending, online, sync]);

  useEffect(() => {
    if (auth.status !== "ready") return;
    const t = setTimeout(() => void runAutoBackup().catch(() => {}), 5000);
    return () => clearTimeout(t);
  }, [auth.status]);

  const value = useMemo<SyncApi>(
    () => ({
      status: !cloud ? "local" : !online ? "offline" : phase,
      pending,
      conflicts: counts?.conflicts ?? 0,
      failed: counts?.failed ?? 0,
      online,
      lastError,
      sync,
    }),
    [cloud, online, phase, pending, counts, lastError, sync],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
