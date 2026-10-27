import { clampPct } from '@/lib/clampPct';
import { unmaskNumber } from '@/lib/numberMask';

/**
 * `SourcingInput.parse` for Runs and the facility taxes: unlike the materials sourcing
 * fields it was built for, these are always-defined numbers with no
 * "unset" state, so blank or unusable input has nowhere to fall but back to
 * `current` — which also, via `SourcingInput`'s "skip onCommit when
 * unchanged" rule, is exactly what makes an emptied-then-abandoned field
 * commit nothing instead of forcing a minimum.
 */
export function parseOrKeep(
  current: number,
  raw: string,
  transform: (n: number) => number
): number {
  const n = unmaskNumber(raw);
  return n === undefined ? current : transform(n);
}

/**
 * `SourcingInput.parse` for a facility tax percent. A tax is never large
 * enough to need a thousands separator, so a lone comma followed by one or
 * two digits ("2,5") is a decimal comma — which the old `type="number"`
 * field honoured in comma locales — not "25". Clamped to 0–100; blank or
 * garbage keeps `current`, like `parseOrKeep`.
 */
export function parseTaxPct(current: number, raw: string): number {
  const trimmed = raw.trim();
  const normalized = /^\d*,\d{1,2}$/.test(trimmed) ? trimmed.replace(',', '.') : trimmed;
  return parseOrKeep(current, normalized, clampPct);
}
