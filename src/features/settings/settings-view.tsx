"use client";

import { PageHeader } from "@/components/layout/page-header";
import { syncEnabled } from "@/lib/sync/engine";
import { BackupCard } from "./backup-card";
import { PasswordCard } from "./password-card";

export function SettingsView() {
  return (
    <>
      <PageHeader title="Настройки" />
      <div className="flex flex-col gap-4">
        <BackupCard />
        {syncEnabled && <PasswordCard />}
      </div>
    </>
  );
}
