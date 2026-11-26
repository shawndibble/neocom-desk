import { clampPct } from '@/lib/clampPct';
import { unmaskNumber } from '@/lib/numberMask';

export function parseOrKeep(
  current: number,
  raw: string,
  transform: (n: number) => number
): number {
  const n = unmaskNumber(raw);
  return n === undefined ? current : transform(n);
}

export function parseTaxPct(current: number, raw: string): number {
  const trimmed = raw.trim();
  const normalized = /^\d*,\d{1,2}$/.test(trimmed) ? trimmed.replace(',', '.') : trimmed;
  return parseOrKeep(current, normalized, clampPct);
}
