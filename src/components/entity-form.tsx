"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { BusinessRuleError, createRecord, updateRecord, validateRow, ValidationError } from "@/core/db/repo";
import type { NewRow, Patch, Row, TableName } from "@/core/db/schema";
import { nowIso, zonedParts, zonedToUtc } from "@/core/lib/dates";
import { newId } from "@/core/lib/ids";
import { useTimeZone } from "@/core/settings";
import { cn } from "@/lib/cn";

type Values = Record<string, unknown>;

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "time" | "datetime" | "select" | "money" | "checkbox" | "custom";
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  /** Пустое значение сохраняется как null. */
  nullable?: boolean;
  /** Поле занимает половину ширины на широких экранах. */
  half?: boolean;
  rows?: number;
  showIf?: (values: Values) => boolean;
  /** Для type = custom: собственный редактор значения. */
  render?: (value: unknown, onChange: (v: unknown) => void, values: Values) => ReactNode;
}

function toInput(field: FieldDef, value: unknown, tz: string): unknown {
  if (field.type === "custom") return value;
  if (field.type === "checkbox") return !!value;
  if (value === null || value === undefined) return "";
  if (field.type === "datetime") {
    const p = zonedParts(String(value), tz);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
  }
  return String(value);
}

function fromInput(field: FieldDef, raw: unknown, tz: string): unknown {
  if (field.type === "custom") return raw;
  if (field.type === "checkbox") return !!raw;
  const s = String(raw ?? "").trim();
  if (s === "" && field.nullable) return null;
  switch (field.type) {
    case "number": {
      if (s === "") return Number.NaN;
      const n = Number(s.replace(/\s/g, "").replace(",", "."));
      return n;
    }
    case "money":
      return s.replace(/[\s ]/g, "").replace(",", ".");
    case "datetime": {
      const [d, t] = s.split("T");
      if (!d || !t) return s;
      try {
        return zonedToUtc(d, t.slice(0, 5), tz).toISOString();
      } catch {
        return s;
      }
    }
    default:
      return field.type === "textarea" ? String(raw ?? "") : s;
  }
}

export interface EntityFormProps<T extends TableName> {
  table: T;
  fields: FieldDef[];
  /** Редактируемая запись; если не задана — создаётся новая. */
  row?: Row<T>;
  /** Значения по умолчанию для новой записи (в том числе скрытые поля). */
  defaults?: Values;
  /** Дополнительная обработка данных перед проверкой и сохранением. */
  transform?: (data: Values, existing?: Row<T>) => Values;
  onDone: (row: Row<T>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** Фиксированный id новой записи (для записей с естественным ключом). */
  fixedId?: string;
}

/**
 * Универсальная форма сущности: React Hook Form + проверка схемой Zod.
 * id новой записи выдаётся при открытии формы, поэтому двойное нажатие
 * «Сохранить» или повторная отправка не создают дубль.
 */
export function EntityForm<T extends TableName>({ table, fields, row, defaults, transform, onDone, onCancel, submitLabel, fixedId }: EntityFormProps<T>) {
  const tz = useTimeZone();
  const [newRowId] = useState(() => fixedId ?? newId());
  const [formError, setFormError] = useState("");

  const initial = useMemo(() => {
    const source = { ...(defaults ?? {}), ...((row as Values | undefined) ?? {}) };
    const out: Values = {};
    for (const f of fields) out[f.name] = toInput(f, source[f.name], tz);
    return out;
    // Начальные значения фиксируются при открытии формы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const build = (raw: Values): Values => {
    const data: Values = {};
    for (const f of fields) {
      if (f.showIf && !f.showIf(raw)) continue;
      data[f.name] = fromInput(f, raw[f.name], tz);
    }
    const merged = { ...(row ? {} : (defaults ?? {})), ...data };
    return transform ? transform(merged, row) : merged;
  };

  const resolver: Resolver<Values> = async (raw) => {
    try {
      const data = build(raw);
      const now = nowIso();
      validateRow(table, row ? { ...row, ...data } : { ...data, id: newRowId, created_at: now, updated_at: now });
      return { values: raw, errors: {} };
    } catch (e) {
      if (e instanceof ValidationError) {
        const known = new Set(fields.map((f) => f.name));
        const errors: Record<string, { type: string; message: string }> = {};
        const rest: string[] = [];
        for (const [k, message] of Object.entries(e.fields)) {
          if (known.has(k)) errors[k] = { type: "validate", message };
          else rest.push(message);
        }
        if (rest.length) errors.root = { type: "validate", message: rest.join(". ") };
        return { values: {}, errors };
      }
      return { values: {}, errors: { root: { type: "validate", message: e instanceof Error ? e.message : "Ошибка проверки данных" } } };
    }
  };

  const form = useForm<Values>({ defaultValues: initial, resolver, mode: "onSubmit", reValidateMode: "onChange" });
  const values = form.watch();
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;

  const submit = form.handleSubmit(async (raw) => {
    setFormError("");
    try {
      const data = build(raw);
      const saved = row ? await updateRecord(table, row.id, data as Patch<T>) : await createRecord(table, data as NewRow<T>, { id: newRowId });
      onDone(saved);
    } catch (e) {
      if (e instanceof ValidationError) {
        for (const [k, message] of Object.entries(e.fields)) form.setError(k, { message });
        setFormError(Object.values(e.fields)[0] ?? "");
      } else if (e instanceof BusinessRuleError) setFormError(e.message);
      else setFormError(e instanceof Error ? `Не удалось сохранить: ${e.message}` : "Не удалось сохранить");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          if (f.showIf && !f.showIf(values)) return null;
          const id = `f-${table}-${f.name}`;
          const error = errors[f.name]?.message;
          const common = { id, "aria-invalid": !!error, placeholder: f.placeholder };
          const wrap = cn(!f.half && "sm:col-span-2");
          if (f.type === "checkbox") {
            return (
              <label key={f.name} htmlFor={id} className={cn("flex items-center gap-2 text-sm", wrap)}>
                <input id={id} type="checkbox" className="h-4 w-4 accent-primary" {...form.register(f.name)} />
                {f.label}
              </label>
            );
          }
          return (
            <Field key={f.name} label={f.label} htmlFor={id} error={error} help={f.help} className={wrap}>
              {f.type === "custom" ? (
                f.render?.(values[f.name], (v) => form.setValue(f.name, v, { shouldDirty: true, shouldValidate: form.formState.isSubmitted }), values)
              ) : f.type === "textarea" ? (
                <Textarea {...common} rows={f.rows ?? 4} {...form.register(f.name)} />
              ) : f.type === "select" ? (
                <Select {...common} {...form.register(f.name)}>
                  {f.nullable && <option value="">— не выбрано —</option>}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...common}
                  type={f.type === "date" ? "date" : f.type === "time" ? "time" : f.type === "datetime" ? "datetime-local" : "text"}
                  inputMode={f.type === "number" || f.type === "money" ? "decimal" : undefined}
                  autoComplete="off"
                  {...form.register(f.name)}
                />
              )}
            </Field>
          );
        })}
      </div>
      {(formError || errors.root?.message) && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError || errors.root?.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>Отмена</Button>}
        <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Сохранение…" : (submitLabel ?? "Сохранить")}
        </Button>
      </div>
    </form>
  );
}
