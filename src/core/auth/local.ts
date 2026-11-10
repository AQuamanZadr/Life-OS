/**
 * Локальная защита входа (режим без облака).
 *
 * Пароль не хранится: в базе лежит только PBKDF2-хеш с солью. Это блокировка
 * интерфейса на устройстве, а не шифрование данных на диске.
 */
import { getMeta, setMeta } from "../db/db";
import { constantTimeEqual, fromBase64, hashPassword, PBKDF2_ITERATIONS, randomBytes, toBase64 } from "../lib/crypto";

interface Credentials {
  salt: string;
  hash: string;
  iterations: number;
  login: string;
}

interface Throttle {
  failures: number;
  locked_until: number;
}

export const MIN_PASSWORD_LENGTH = 8;
const FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`;
  if (password.length > 256) return "Слишком длинный пароль";
  return null;
}

/** Длительность блокировки после очередной неудачной попытки. */
export function lockDurationMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (failures - FREE_ATTEMPTS));
}

export async function hasCredentials(): Promise<boolean> {
  return (await getMeta<Credentials | null>("auth_local", null)) !== null;
}

export async function getLogin(): Promise<string> {
  return (await getMeta<Credentials | null>("auth_local", null))?.login ?? "";
}

export async function setupCredentials(login: string, password: string): Promise<void> {
  if (await hasCredentials()) throw new Error("Учётная запись уже создана");
  const problem = validatePassword(password);
  if (problem) throw new Error(problem);
  if (!login.trim()) throw new Error("Введите логин");
  const salt = randomBytes(16);
  await setMeta("auth_local", { login: login.trim(), salt: toBase64(salt), hash: await hashPassword(password, salt), iterations: PBKDF2_ITERATIONS } satisfies Credentials);
}

export type VerifyResult = { ok: true } | { ok: false; lockedUntil: number | null; attemptsLeft: number };

/** Проверка логина и пароля с ограничением числа попыток. */
export async function verifyCredentials(login: string, password: string, now: number = Date.now()): Promise<VerifyResult> {
  const throttle = await getMeta<Throttle>("auth_throttle", { failures: 0, locked_until: 0 });
  if (throttle.locked_until > now) return { ok: false, lockedUntil: throttle.locked_until, attemptsLeft: 0 };
  const creds = await getMeta<Credentials | null>("auth_local", null);
  if (!creds) return { ok: false, lockedUntil: null, attemptsLeft: 0 };
  const hash = await hashPassword(password, fromBase64(creds.salt), creds.iterations);
  const ok = constantTimeEqual(hash, creds.hash) && login.trim().toLowerCase() === creds.login.toLowerCase();
  if (ok) {
    await setMeta("auth_throttle", { failures: 0, locked_until: 0 } satisfies Throttle);
    return { ok: true };
  }
  const failures = throttle.failures + 1;
  const lock = lockDurationMs(failures);
  await setMeta("auth_throttle", { failures, locked_until: lock ? now + lock : 0 } satisfies Throttle);
  return { ok: false, lockedUntil: lock ? now + lock : null, attemptsLeft: Math.max(0, FREE_ATTEMPTS - failures) };
}

export async function changeLocalPassword(current: string, next: string): Promise<void> {
  const creds = await getMeta<Credentials | null>("auth_local", null);
  if (!creds) throw new Error("Учётная запись не создана");
  const res = await verifyCredentials(creds.login, current);
  if (!res.ok) throw new Error(res.lockedUntil ? "Слишком много попыток. Повторите позже." : "Текущий пароль неверен");
  const problem = validatePassword(next);
  if (problem) throw new Error(problem);
  const salt = randomBytes(16);
  await setMeta("auth_local", { login: creds.login, salt: toBase64(salt), hash: await hashPassword(next, salt), iterations: PBKDF2_ITERATIONS } satisfies Credentials);
  await bumpSessionEpoch();
}

export async function getSessionEpoch(): Promise<number> {
  return getMeta<number>("auth_epoch", 1);
}

/** Делает недействительными все открытые сессии (вкладки). */
export async function bumpSessionEpoch(): Promise<number> {
  const next = (await getSessionEpoch()) + 1;
  await setMeta("auth_epoch", next);
  return next;
}
