import type { CorpLabel } from '@/features/corp/corpTicker';
import type { TableCell } from './types';

export type CellTone = 'good' | 'caution' | 'bad';

export function signedTone(value: number): CellTone | undefined {
  if (!Number.isFinite(value) || value === 0) return undefined;
  return value > 0 ? 'good' : 'bad';
}

export function signedCell(text: string, value: number): TableCell {
  const tone = signedTone(value);
  return tone ? { text, tone } : text;
}

export function fractionBar(value: number, max: number): number | undefined {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return undefined;
  return Math.min(1, Math.max(0, value / max));
}

export function shareCell(part: number, whole: number, none = '0%'): TableCell {
  const share = fractionBar(Math.max(0, part), whole);
  return share === undefined ? none : { text: `${Math.round(share * 100)}%`, bar: share };
}

export function corpCell(corp: CorpLabel): TableCell {
  return { text: corp.ticker, hint: corp.name };
}
