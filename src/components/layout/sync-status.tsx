"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Cloud, CloudAlert, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSyncState,
  requestSync,
  subscribeSync,
  syncEnabled,
  syncNow,
  type SyncStatus as Status,
} from "@/lib/sync/engine";
import { cn } from "@/lib/utils";

const labels: Record<Status, string> = {
  idle: "Синхронизировано",
  syncing: "Синхронизация…",
  offline: "Нет сети — изменения сохранены на устройстве",
  error: "Ошибка синхронизации. Нажмите, чтобы повторить",
};

const icons = { idle: Cloud, syncing: RefreshCw, offline: CloudOff, error: CloudAlert };

export function SyncStatus() {
  const { status } = useSyncExternalStore(subscribeSync, getSyncState, getSyncState);

  useEffect(() => {
    if (!syncEnabled) return;
    const sync = () => requestSync(0);
    const onVisible = () => document.visibilityState === "visible" && sync();
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(onVisible, 60_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  if (!syncEnabled) return null;
  const Icon = icons[status];
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0"
      title={labels[status]}
      aria-label={labels[status]}
      data-sync={status}
      onClick={() => void syncNow()}
    >
      <Icon
        className={cn(
          status === "syncing" && "animate-spin",
          status === "error" && "text-destructive",
          (status === "idle" || status === "offline") && "text-muted-foreground",
        )}
      />
    </Button>
  );
}
