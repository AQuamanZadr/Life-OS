"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut, syncEnabled } from "@/lib/sync/engine";

export function SignOut() {
  const [pending, setPending] = useState(false);
  if (!syncEnabled) return null;
  return (
    <div className="border-t border-border p-3">
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
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:opacity-50"
      >
        <LogOut className="size-4 shrink-0" />
        Выйти
      </button>
    </div>
  );
}
