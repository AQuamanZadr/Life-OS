/**
 * Точная денежная арифметика.
 *
 * Суммы хранятся как десятичные строки ("1234.50") и считаются в целых
 * минимальных единицах через BigInt. Арифметика с плавающей точкой для денег
 * не используется нигде.
 */

export const MAX_DECIMALS = 8;
/** Соответствует NUMERIC(28, 8) в PostgreSQL: до 20 цифр целой части. */
const MAX_INTEGER_DIGITS = 20;

export class MoneyError extends Error {}

const AMOUNT_RE = /^([+-]?)(\d+)(?:[.,](\d+))?$/;

/** Разбирает десятичную строку в минимальные единицы валюты. */
export function toMinor(amount: string, decimals: number = 2): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new MoneyError("Некорректная точность валюты");
  }
  const cleaned = String(amount).replace(/[\s  ]/g, "");
  const m = AMOUNT_RE.exec(cleaned);
  if (!m) throw new MoneyError("Введите число, например 1500.50");
  const [, sign, intPart, fracRaw = ""] = m;
  const frac = fracRaw.replace(/0+$/, "");
  if (frac.length > decimals) {
    throw new MoneyError(decimals === 0 ? "Для этой валюты дробная часть не допускается" : `Не более ${decimals} знаков после запятой`);
  }
  const intNorm = intPart.replace(/^0+(?=\d)/, "");
  if (intNorm.length > MAX_INTEGER_DIGITS) throw new MoneyError("Слишком большое число");
  const minor = BigInt(intNorm + frac.padEnd(decimals, "0"));
  return sign === "-" ? -minor : minor;
}

/** Минимальные единицы → каноническая строка с фиксированным числом знаков. */
export function fromMinor(minor: bigint, decimals: number = 2): string {
  const neg = minor < 0n;
  const digits = (neg ? -minor : minor).toString().padStart(decimals + 1, "0");
  const intPart = digits.slice(0, digits.length - decimals);
  const frac = decimals > 0 ? "." + digits.slice(digits.length - decimals) : "";
  return `${neg ? "-" : ""}${intPart}${frac}`;
}

/** Приводит ввод пользователя к канонической строке; бросает MoneyError. */
export function normalizeAmount(amount: string, decimals: number = 2): string {
  return fromMinor(toMinor(amount, decimals), decimals);
}

export function isValidAmount(amount: string, decimals: number = 2): boolean {
  try {
    toMinor(amount, decimals);
    return true;
  } catch {
    return false;
  }
}

export function addAmounts(a: string, b: string, decimals: number = 2): string {
  return fromMinor(toMinor(a, decimals) + toMinor(b, decimals), decimals);
}

export function subAmounts(a: string, b: string, decimals: number = 2): string {
  return fromMinor(toMinor(a, decimals) - toMinor(b, decimals), decimals);
}

export function sumAmounts(amounts: string[], decimals: number = 2): string {
  let total = 0n;
  for (const a of amounts) total += toMinor(a, decimals);
  return fromMinor(total, decimals);
}

export function compareAmounts(a: string, b: string, decimals: number = 2): number {
  const d = toMinor(a, decimals) - toMinor(b, decimals);
  return d === 0n ? 0 : d > 0n ? 1 : -1;
}

/** Доля a от b в процентах (для отображения; сама сумма не округляется). */
export function percentOf(a: string, b: string, decimals: number = 2): number {
  const den = toMinor(b, decimals);
  if (den === 0n) return 0;
  const scaled = (toMinor(a, decimals) * 10000n) / den;
  return Number(scaled) / 100;
}

/** Для графиков: приближённое число. Не использовать в расчётах. */
export function toChartNumber(amount: string, decimals: number = 2): number {
  return Number(fromMinor(toMinor(amount, decimals), decimals));
}

export interface CurrencyDef {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const BUILTIN_CURRENCIES: CurrencyDef[] = [
  { code: "KZT", name: "Казахстанский тенге", symbol: "₸", decimals: 2 },
  { code: "USD", name: "Доллар США", symbol: "$", decimals: 2 },
  { code: "EUR", name: "Евро", symbol: "€", decimals: 2 },
];

export function currencyDecimals(code: string, currencies: CurrencyDef[] = BUILTIN_CURRENCIES): number {
  return currencies.find((c) => c.code === code)?.decimals ?? 2;
}

/** Форматирование для отображения: «1 234 567,50 ₸». */
export function formatMoney(amount: string, code: string, currencies: CurrencyDef[] = BUILTIN_CURRENCIES): string {
  const def = currencies.find((c) => c.code === code);
  const decimals = def?.decimals ?? 2;
  let canonical: string;
  try {
    canonical = normalizeAmount(amount, decimals);
  } catch {
    return `${amount} ${code}`;
  }
  const neg = canonical.startsWith("-");
  const [intPart, frac] = canonical.replace("-", "").split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "−" : ""}${grouped}${frac ? "," + frac : ""} ${def?.symbol ?? code}`;
}
