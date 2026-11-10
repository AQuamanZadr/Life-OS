"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hardNavigate } from "@/lib/hard-navigate";
import { getSupabase } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";

const subscribe = () => () => {};

export function LoginForm() {
  // До загрузки скриптов форма неактивна, чтобы браузер не отправил её сам.
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (!supabaseConfigured) {
    return (
      <p className="text-sm text-destructive">
        Не заданы настройки Supabase. Вход недоступен.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (!error) {
        // Полная перезагрузка, чтобы сервер увидел cookie сессии.
        hardNavigate("/");
        return;
      }
      setError(
        error.code === "invalid_credentials"
          ? "Неверная почта или пароль"
          : "Не удалось войти. Попробуйте ещё раз.",
      );
    } catch {
      setError("Нет соединения с сервером");
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} method="post" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Почта</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || !ready}>
        {pending ? "Вход…" : "Войти"}
      </Button>
    </form>
  );
}
