"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getDb, getMeta, setMeta } from "../db/db";
import { getSupabase, isCloudConfigured } from "../sync/supabase";
import { bumpSessionEpoch, changeLocalPassword, getLogin, getSessionEpoch, hasCredentials, lockDurationMs, setupCredentials, validatePassword, verifyCredentials } from "./local";
import { DEFAULT_SETTINGS } from "../settings";
import { SETTINGS_ID } from "../db/schema";

export type AuthStatus = "loading" | "setup" | "locked" | "mfa" | "ready";

interface AuthState {
  status: AuthStatus;
  mode: "local" | "cloud";
  login: string;
  userId: string | null;
}

export type SignInResult = { ok: true } | { ok: false; message: string };

interface AuthApi extends AuthState {
  signIn(login: string, password: string): Promise<SignInResult>;
  setup(login: string, password: string): Promise<SignInResult>;
  verifyMfa(code: string): Promise<SignInResult>;
  /** Завершить текущую сессию. */
  lock(): Promise<void>;
  /** Завершить все активные сессии на всех устройствах и вкладках. */
  signOutEverywhere(): Promise<void>;
  changePassword(current: string, next: string): Promise<SignInResult>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth вне AuthProvider");
  return ctx;
}

const SESSION_KEY = "lifeos.session";
const ACTIVE_KEY = "lifeos.lastActive";

function touchActivity() {
  try {
    localStorage.setItem(ACTIVE_KEY, String(Date.now()));
  } catch {
    /* хранилище недоступно */
  }
}

function lastActivity(): number {
  try {
    return Number(localStorage.getItem(ACTIVE_KEY) ?? 0);
  } catch {
    return 0;
  }
}

async function idleLimitMs(): Promise<number> {
  const s = await getDb().user_settings.get(SETTINGS_ID);
  return (s?.idle_timeout_minutes ?? DEFAULT_SETTINGS.idle_timeout_minutes) * 60_000;
}

function formatWait(until: number): string {
  const sec = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  return sec >= 60 ? `${Math.ceil(sec / 60)} мин` : `${sec} с`;
}

/** Ограничение попыток входа в облачном режиме (дополняет серверные лимиты Supabase). */
async function cloudThrottle(success?: boolean): Promise<number> {
  const t = await getMeta<{ failures: number; locked_until: number }>("auth_cloud_throttle", { failures: 0, locked_until: 0 });
  if (success === undefined) return t.locked_until > Date.now() ? t.locked_until : 0;
  if (success) {
    await setMeta("auth_cloud_throttle", { failures: 0, locked_until: 0 });
    return 0;
  }
  const failures = t.failures + 1;
  const lock = lockDurationMs(failures);
  await setMeta("auth_cloud_throttle", { failures, locked_until: lock ? Date.now() + lock : 0 });
  return lock ? Date.now() + lock : 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode: AuthState["mode"] = isCloudConfigured() ? "cloud" : "local";
  const [state, setState] = useState<AuthState>({ status: "loading", mode, login: "", userId: null });
  const channel = useRef<BroadcastChannel | null>(null);

  const refresh = useCallback(async () => {
    if (mode === "cloud") {
      const supabase = getSupabase()!;
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return setState({ status: "locked", mode, login: "", userId: null });
      if (Date.now() - lastActivity() > (await idleLimitMs()) && lastActivity() > 0) {
        await supabase.auth.signOut({ scope: "local" });
        return setState({ status: "locked", mode, login: session.user.email ?? "", userId: null });
      }
      let needMfa = false;
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        needMfa = !!aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
      } catch {
        /* офлайн: уровень уже проверен при входе */
      }
      setState({ status: needMfa ? "mfa" : "ready", mode, login: session.user.email ?? "", userId: session.user.id });
      return;
    }
    if (!(await hasCredentials())) return setState({ status: "setup", mode, login: "", userId: null });
    const login = await getLogin();
    let ok = false;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      ok = !!raw && JSON.parse(raw).epoch === (await getSessionEpoch()) && Date.now() - lastActivity() <= (await idleLimitMs());
    } catch {
      ok = false;
    }
    if (!ok) sessionStorage.removeItem(SESSION_KEY);
    setState({ status: ok ? "ready" : "locked", mode, login, userId: null });
  }, [mode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("lifeos-auth");
      channel.current.onmessage = () => void refresh();
    }
    const sub = mode === "cloud" ? getSupabase()!.auth.onAuthStateChange((event) => event === "SIGNED_OUT" && void refresh()) : null;
    return () => {
      channel.current?.close();
      sub?.data.subscription.unsubscribe();
    };
  }, [mode, refresh]);

  const lock = useCallback(async () => {
    if (mode === "cloud") await getSupabase()!.auth.signOut({ scope: "local" });
    else sessionStorage.removeItem(SESSION_KEY);
    await refresh();
  }, [mode, refresh]);

  // Автоматическое завершение неактивной сессии.
  useEffect(() => {
    if (state.status !== "ready") return;
    touchActivity();
    let last = Date.now();
    const onActivity = () => {
      if (Date.now() - last > 10_000) {
        last = Date.now();
        touchActivity();
      }
    };
    const check = async () => {
      if (Date.now() - lastActivity() > (await idleLimitMs())) await lock();
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, 20_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, [state.status, lock]);

  const api = useMemo<AuthApi>(() => {
    const startLocalSession = async () => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ epoch: await getSessionEpoch() }));
      touchActivity();
      await refresh();
    };
    return {
      ...state,
      lock,
      async setup(login, password) {
        try {
          await setupCredentials(login, password);
          await startLocalSession();
          return { ok: true };
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : "Не удалось создать учётную запись" };
        }
      },
      async signIn(login, password) {
        if (mode === "local") {
          const res = await verifyCredentials(login, password);
          if (res.ok) {
            await startLocalSession();
            return { ok: true };
          }
          if (res.lockedUntil) return { ok: false, message: `Слишком много попыток. Повторите через ${formatWait(res.lockedUntil)}.` };
          return { ok: false, message: `Неверный логин или пароль. Осталось попыток: ${res.attemptsLeft}.` };
        }
        const lockedUntil = await cloudThrottle();
        if (lockedUntil) return { ok: false, message: `Слишком много попыток. Повторите через ${formatWait(lockedUntil)}.` };
        const { error } = await getSupabase()!.auth.signInWithPassword({ email: login.trim(), password });
        if (error) {
          if (/fetch|network/i.test(error.message)) return { ok: false, message: "Нет соединения с сервером. Для первого входа нужен интернет." };
          const until = await cloudThrottle(false);
          return { ok: false, message: until ? `Слишком много попыток. Повторите через ${formatWait(until)}.` : "Неверный логин или пароль." };
        }
        await cloudThrottle(true);
        touchActivity();
        await refresh();
        return { ok: true };
      },
      async verifyMfa(code) {
        const supabase = getSupabase()!;
        const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
        const factor = factors?.totp.find((f) => f.status === "verified");
        if (listError || !factor) return { ok: false, message: "Второй фактор не найден" };
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
        if (error) return { ok: false, message: "Неверный код" };
        await refresh();
        return { ok: true };
      },
      async signOutEverywhere() {
        if (mode === "cloud") await getSupabase()!.auth.signOut({ scope: "global" });
        else {
          await bumpSessionEpoch();
          sessionStorage.removeItem(SESSION_KEY);
        }
        channel.current?.postMessage("epoch");
        await refresh();
      },
      async changePassword(current, next) {
        try {
          if (mode === "local") {
            await changeLocalPassword(current, next);
            await startLocalSession();
            channel.current?.postMessage("epoch");
            return { ok: true };
          }
          const problem = validatePassword(next);
          if (problem) return { ok: false, message: problem };
          const supabase = getSupabase()!;
          const check = await supabase.auth.signInWithPassword({ email: state.login, password: current });
          if (check.error) return { ok: false, message: "Текущий пароль неверен" };
          const { error } = await supabase.auth.updateUser({ password: next });
          if (error) return { ok: false, message: error.message };
          await supabase.auth.signOut({ scope: "others" });
          return { ok: true };
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : "Не удалось сменить пароль" };
        }
      },
    };
  }, [state, mode, lock, refresh]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}
