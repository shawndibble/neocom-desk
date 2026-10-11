/**
 * Pure helpers for the table cell variant `{ text, tone?, bar? }` (see
 * `TableCell` in `types.ts` for the one shared rule). No fetch, DOM or Dexie.
 */
import type { TableCell } from './types';

export type CellTone = 'good' | 'caution' | 'bad';

/** Above zero is good, below is bad, zero and unknown carry no tone. */
export function signedTone(value: number): CellTone | undefined {
  if (!Number.isFinite(value) || value === 0) return undefined;
  return value > 0 ? 'good' : 'bad';
}

/** The text with the sign's tone; a zero or unknown value stays plain text. */
export function signedCell(text: string, value: number): TableCell {
  const tone = signedTone(value);
  return tone ? { text, tone } : text;
}

/** `value` out of `max` as a 0..1 bar fill; undefined when either is not a real figure (no bar is drawn). */
export function fractionBar(value: number, max: number): number | undefined {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return undefined;
  return Math.min(1, Math.max(0, value / max));
}
