"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toDateKey } from "@/lib/dates";
import {
  existingIds,
  exportBackup,
  parseBackup,
  restoreBackup,
  type ParsedBackup,
} from "./backup";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function BackupCard() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const blob = new Blob([await exportBackup()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `life-os-backup-${toDateKey()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage({ text: "Копия сохранена в загрузки." });
    } catch {
      setMessage({ text: "Не удалось создать копию.", error: true });
    }
    setBusy(false);
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    if (file.size > MAX_FILE_BYTES) {
      setMessage({ text: "Файл слишком большой.", error: true });
      return;
    }
    const parsed = parseBackup(await file.text(), await existingIds());
    if (!parsed) {
      setMessage({ text: "Это не файл резервной копии LIFE OS.", error: true });
    } else if (parsed.total === 0) {
      setMessage({ text: "В файле нет записей.", error: true });
    } else {
      setPending(parsed);
    }
  }

  async function restore() {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending);
      setMessage({ text: `Восстановлено записей: ${pending.total}.` });
    } catch {
      setMessage({ text: "Не удалось восстановить данные.", error: true });
    }
    setPending(null);
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Резервная копия</CardTitle>
        <CardDescription>
          Файл со всеми вашими записями. Храните его в надёжном месте: данные в нём не
          зашифрованы.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={download} disabled={busy}>
            <Download />
            Скачать копию
          </Button>
          <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}>
            <Upload />
            Восстановить из файла
          </Button>
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Файл резервной копии"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {message && (
          <p
            role="status"
            className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          >
            {message.text}
          </p>
        )}
      </CardContent>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent
          title="Восстановить данные?"
          description={
            pending
              ? `Копия от ${new Date(pending.exportedAt).toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" })}, записей: ${pending.total}${pending.skipped ? `, пропущено повреждённых: ${pending.skipped}` : ""}. Записи из копии вернутся к сохранённому состоянию, включая удалённые позже. Записи, созданные после копии, останутся.`
              : undefined
          }
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Отмена
            </Button>
            <Button onClick={restore} disabled={busy}>
              Восстановить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
