"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "./AuthProvider";
import { MIN_PASSWORD_LENGTH } from "./local";

export function LoginScreen() {
  const auth = useAuth();
  const [login, setLogin] = useState(auth.login);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSetup = auth.status === "setup";
  const isMfa = auth.status === "mfa";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (isSetup && password !== repeat) return setError("Пароли не совпадают");
    setBusy(true);
    try {
      const res = isMfa ? await auth.verifyMfa(code) : isSetup ? await auth.setup(login, password) : await auth.signIn(login, password);
      if (!res.ok) setError(res.message);
      setPassword("");
      setRepeat("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm" aria-labelledby="login-title">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-fg">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 id="login-title" className="text-xl font-bold">
              Life OS
            </h1>
            <p className="text-sm text-muted">{isMfa ? "Подтверждение входа" : isSetup ? "Создание учётной записи владельца" : "Вход в систему"}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {isMfa ? (
            <Field label="Код из приложения-аутентификатора" htmlFor="mfa">
              <Input id="mfa" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
            </Field>
          ) : (
            <>
              <Field label={auth.mode === "cloud" ? "Email" : "Логин"} htmlFor="login">
                <Input id="login" type={auth.mode === "cloud" ? "email" : "text"} autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
              </Field>
              <Field label="Пароль" htmlFor="password" help={isSetup ? `Не короче ${MIN_PASSWORD_LENGTH} символов. Восстановить забытый пароль будет нельзя.` : undefined}>
                <Input id="password" type="password" autoComplete={isSetup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isSetup ? MIN_PASSWORD_LENGTH : undefined} />
              </Field>
              {isSetup && (
                <Field label="Повторите пароль" htmlFor="repeat">
                  <Input id="repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
                </Field>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Проверка…" : isMfa ? "Подтвердить" : isSetup ? "Создать и войти" : "Войти"}
          </Button>
          {isMfa && (
            <Button variant="ghost" onClick={() => void auth.lock()}>
              Выйти
            </Button>
          )}
        </div>
        <p className="mt-4 text-xs text-muted">
          {auth.mode === "cloud" ? "Данные хранятся в вашей облачной базе и на этом устройстве." : "Локальный режим: данные хранятся только на этом устройстве."} Публичная регистрация не предусмотрена.
        </p>
      </form>
    </main>
  );
}
