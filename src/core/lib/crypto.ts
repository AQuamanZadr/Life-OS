/** Криптографические примитивы на Web Crypto API (работают в браузере и в Node). */

export const PBKDF2_ITERATIONS = 310_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2Key(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits", "deriveKey"]);
}

/** Хеш пароля (PBKDF2-SHA-256). Возвращает base64. */
export async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, await pbkdf2Key(password), 256);
  return toBase64(new Uint8Array(bits));
}

/** Сравнение строк за постоянное время. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface EncryptedEnvelope {
  format: "life-os-encrypted";
  version: 1;
  cipher: "AES-256-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

/** Шифрует текст паролем: AES-256-GCM, ключ — PBKDF2. */
export async function encryptText(plain: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<EncryptedEnvelope> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, await pbkdf2Key(password), { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return { format: "life-os-encrypted", version: 1, cipher: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

export class DecryptError extends Error {
  constructor() {
    super("Не удалось расшифровать: неверный пароль или файл повреждён");
    this.name = "DecryptError";
  }
}

export async function decryptText(envelope: EncryptedEnvelope, password: string): Promise<string> {
  try {
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(envelope.salt), iterations: envelope.iterations },
      await pbkdf2Key(password),
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.data));
    return dec.decode(plain);
  } catch {
    throw new DecryptError();
  }
}
