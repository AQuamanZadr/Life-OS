"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { signOut, syncEnabled } from "@/lib/sync/engine";
import { cn } from "@/lib/utils";

const item =
  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/60 hover:text-foreground disabled:opacity-50";

// Нижний блок меню: настройки и выход.
export function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const active = pathname === "/settings";
  return (
    <div className="flex flex-col gap-0.5 border-t border-border p-3">
      <Link
        href="/settings"
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          item,
          active ? "bg-accent font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        <Settings className="size-4 shrink-0" />
        Настройки
      </Link>
      {syncEnabled && (
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await signOut();
            } finally {
              setPending(false);
            }
          }}
          className={cn(item, "text-muted-foreground")}
        >
          <LogOut className="size-4 shrink-0" />
          Выйти
        </button>
      )}
    </div>
  );
}
