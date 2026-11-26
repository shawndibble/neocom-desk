import { formatCompactNumber } from './compactNumber';
import { createNumberFormat, getDecimalMark, getGroupMark } from './numberLocale';
import { parseLocalizedNumber } from '@/engine/numbers/parseLocalizedNumber';

const formatters = new Map<number, (value: number) => string>();

function formatterFor(decimals: number): (value: number) => string {
  let formatter = formatters.get(decimals);
  if (!formatter) {
    formatter = createNumberFormat({
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, formatter);
  }
  return formatter;
}

export function clampIskZero(value: number, decimals: number): number {
  const epsilon = 0.5 / 10 ** decimals;
  return Math.abs(value) < epsilon ? 0 : value;
}

export function formatIsk(value: number, decimals = 0): string {
  return formatterFor(decimals)(clampIskZero(value, decimals));
}

export function formatIskAuto(value: number, centsBelow = 100): string {
  return formatIsk(value, Math.abs(value) > centsBelow ? 0 : 2);
}

export const CONTRACT_ISK_CENTS_BELOW = 1000;

export function formatContractIsk(value: number): string {
  return `${formatIskAuto(value, CONTRACT_ISK_CENTS_BELOW)} ISK`;
}

const MARKET_ISK_CENTS_BELOW = 9_999.995;

export function marketIskDecimals(value: number): 0 | 2 {
  return Math.abs(value) >= MARKET_ISK_CENTS_BELOW ? 0 : 2;
}

export function formatMarketIsk(value: number): string {
  return formatIsk(value, marketIskDecimals(value));
}

export function roundIsk(value: number): number {
  const cents = Math.round(value * 100) / 100;
  return value > 0 ? Math.max(cents, 0.01) : cents;
}

const iskMasker = createNumberFormat({ maximumFractionDigits: 2 });

export function maskIsk(value: number): string {
  return iskMasker(value);
}

export function formatIskCompact(value: number): string {
  return formatCompactNumber(clampIskZero(value, 0));
}

export function formatIskCompactSigned(value: number): string {
  const text = formatIskCompact(value);
  return text === '0' || text.startsWith('-') ? text : `+${text}`;
}

const ISK_SHORTHAND_MULTIPLIERS: Readonly<Record<string, number>> = {
  b: 1_000_000_000,
  m: 1_000_000,
  t: 1_000,
  k: 1_000,
};

const ISK_AMOUNT_PATTERN = /^([\d.,'\u2019\s\u00a0\u2009\u202f]*\d)\s*([bmtk])?$/i;

export function parseIskAmount(input: string): number | null {
  const match = ISK_AMOUNT_PATTERN.exec(input.trim());
  if (!match) return null;
  const numeric = parseLocalizedNumber(
    /^[.,]/.test(match[1]) ? `0${match[1]}` : match[1],
    getDecimalMark()
  );
  if (numeric === null) return null;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix ? ISK_SHORTHAND_MULTIPLIERS[suffix] : 1;
  return numeric * multiplier;
}

export function maskIskTyping(text: string): string {
  const match = /^([\d.,'\u2019\s\u00a0\u2009\u202f]*)\s*([bmtk])?$/i.exec(text.trim());
  if (!match) return text;
  const decimal = getDecimalMark();
  const body = match[1];
  const at = body.indexOf(decimal);
  if (at >= 0 && body.indexOf(decimal, at + 1) >= 0) return text;
  const group = getGroupMark();
  const whole = (at < 0 ? body : body.slice(0, at)).replace(/\D/g, '');
  const fraction = at < 0 ? null : body.slice(at + 1).replace(/\D/g, '');
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, group);
  return `${grouped}${fraction === null ? '' : decimal + fraction}${match[2] ?? ''}`;
}

export function parseNumeric(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
