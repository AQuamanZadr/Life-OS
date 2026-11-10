import { describe, expect, it } from "vitest";
import { getMeta } from "../db/db";
import { changeLocalPassword, getSessionEpoch, hasCredentials, lockDurationMs, setupCredentials, validatePassword, verifyCredentials } from "./local";

describe("локальная авторизация", () => {
  it("хранит только хеш пароля", async () => {
    expect(await hasCredentials()).toBe(false);
    await setupCredentials("owner", "очень-секретно-1");
    const stored = JSON.stringify(await getMeta("auth_local", null));
    expect(stored).not.toContain("очень-секретно-1");
    expect(await hasCredentials()).toBe(true);
    await expect(setupCredentials("other", "очень-секретно-2")).rejects.toThrow();
  }, 30_000);

  it("проверяет логин и пароль", async () => {
    await setupCredentials("Owner", "password-123");
    expect((await verifyCredentials("owner", "password-123")).ok).toBe(true);
    expect((await verifyCredentials("owner", "password-124")).ok).toBe(false);
    expect((await verifyCredentials("someone", "password-123")).ok).toBe(false);
    expect((await verifyCredentials("owner", "")).ok).toBe(false);
  }, 30_000);

  it("блокирует вход после нескольких неудачных попыток", async () => {
    await setupCredentials("owner", "password-123");
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) {
      const r = await verifyCredentials("owner", "bad", t0);
      expect(r).toMatchObject({ ok: false, lockedUntil: null });
    }
    const fifth = await verifyCredentials("owner", "bad", t0);
    expect(fifth).toMatchObject({ ok: false, lockedUntil: t0 + 30_000 });
    // Во время блокировки не проходит даже верный пароль.
    expect((await verifyCredentials("owner", "password-123", t0 + 1000)).ok).toBe(false);
    expect((await verifyCredentials("owner", "password-123", t0 + 30_001)).ok).toBe(true);
    // Успешный вход сбрасывает счётчик.
    expect(await verifyCredentials("owner", "bad", t0 + 40_000)).toMatchObject({ ok: false, attemptsLeft: 4 });
  }, 60_000);

  it("время блокировки растёт и ограничено", () => {
    expect(lockDurationMs(4)).toBe(0);
    expect(lockDurationMs(5)).toBe(30_000);
    expect(lockDurationMs(6)).toBe(60_000);
    expect(lockDurationMs(50)).toBe(15 * 60_000);
  });

  it("смена пароля требует текущий и завершает остальные сессии", async () => {
    await setupCredentials("owner", "password-123");
    const epoch = await getSessionEpoch();
    await expect(changeLocalPassword("wrong", "new-password-1")).rejects.toThrow();
    await expect(changeLocalPassword("password-123", "short")).rejects.toThrow();
    await changeLocalPassword("password-123", "new-password-1");
    expect((await verifyCredentials("owner", "password-123")).ok).toBe(false);
    expect((await verifyCredentials("owner", "new-password-1")).ok).toBe(true);
    expect(await getSessionEpoch()).toBe(epoch + 1);
  }, 60_000);

  it("проверяет требования к паролю", () => {
    expect(validatePassword("1234567")).toBeTruthy();
    expect(validatePassword("12345678")).toBeNull();
  });
});
