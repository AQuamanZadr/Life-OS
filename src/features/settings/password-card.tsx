"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase/client";

const MIN_LENGTH = 10;

export function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setDone(false);
    const found: Record<string, string> = {};
    if (!current) found.current = "Введите текущий пароль";
    if (next.length < MIN_LENGTH) found.next = `Не короче ${MIN_LENGTH} символов`;
    else if (next === current) found.next = "Новый пароль совпадает с текущим";
    if (repeat !== next) found.repeat = "Пароли не совпадают";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) throw new Error("no session");
      // Проверяем текущий пароль, чтобы сменить его не мог тот, кто просто
      // получил доступ к открытому приложению.
      const check = await supabase.auth.signInWithPassword({ email, password: current });
      if (check.error) {
        setErrors(
          check.error.code === "invalid_credentials"
            ? { current: "Неверный текущий пароль" }
            : { form: "Не удалось проверить пароль. Попробуйте ещё раз." },
        );
      } else {
        const { error } = await supabase.auth.updateUser({ password: next });
        if (error) {
          setErrors(
            error.code === "weak_password"
              ? { next: "Слишком простой пароль" }
              : { form: "Не удалось сменить пароль. Попробуйте ещё раз." },
          );
        } else {
          setCurrent("");
          setNext("");
          setRepeat("");
          setDone(true);
        }
      }
    } catch {
      setErrors({ form: "Нет соединения с сервером" });
    }
    setPending(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пароль</CardTitle>
        <CardDescription>Смена пароля для входа в LIFE OS.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex max-w-sm flex-col gap-4" noValidate>
          <Field id="pw-current" label="Текущий пароль" error={errors.current}>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field id="pw-next" label="Новый пароль" error={errors.next}>
            <Input
              id="pw-next"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field id="pw-repeat" label="Новый пароль ещё раз" error={errors.repeat}>
            <Input
              id="pw-repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </Field>
          {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
          {done && (
            <p role="status" className="text-sm text-success">
              Пароль изменён.
            </p>
          )}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохранение…" : "Сменить пароль"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
