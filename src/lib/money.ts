// Деньги хранятся целым числом копеек: так суммы складываются без ошибок округления.

export const MAX_AMOUNT_MINOR = 10_000_000_000_00; // 10 млрд ₽

// "1 234,5" → 123450. null — если это не положительная сумма с копейками.
export function parseAmount(input: string): number | null {
  const text = input.replace(/[\s  ]/g, "").replace(",", ".");
  const match = /^(\d{1,11})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return minor > 0 && minor <= MAX_AMOUNT_MINOR ? minor : null;
}

const groups = new Intl.NumberFormat("ru-RU");

// 123450 → "1 234,50 ₽"; отрицательные — со знаком минус.
export function formatMoney(minor: number, options?: { sign?: boolean }): string {
  const abs = Math.abs(minor);
  const rubles = Math.trunc(abs / 100);
  const kopecks = String(abs % 100).padStart(2, "0");
  const sign = minor < 0 ? "−" : options?.sign && minor > 0 ? "+" : "";
  return `${sign}${groups.format(rubles)},${kopecks} ₽`;
}

// Значение для поля ввода: "1234,5" → "1234,50", без копеек — "1234".
export function amountToInput(minor: number): string {
  const kopecks = minor % 100;
  const rubles = Math.trunc(minor / 100);
  return kopecks === 0 ? String(rubles) : `${rubles},${String(kopecks).padStart(2, "0")}`;
}
