import type { CSSProperties } from 'react';
import {
  baselineDelta,
  type BaselineDelta,
  type CompareRow,
} from '@/engine/fittings/fittingCompare';
import { FLAG_STATS, NUMERIC_FIELDS, STAT_DIGITS } from '@/engine/fittings/fittingStatFields';
import { formatSeconds } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { fixed0, fixed1, fixedFormat } from '@/lib/fixedFormat';
import type { Translate } from '@/lib/translate';
import { flagWord } from './flagWord';

export interface CompareColumn {
  letter: string;
  position: number | null;
}

const NONE_WHEN_ZERO = new Set<CompareRow['key']>(
  NUMERIC_FIELDS.filter((field) => field.hideWhenNone).map((field) => field.key)
);

export const UNIT_KEYS: ReadonlySet<CompareRow['key']> = new Set([
  'sustainedTank',
  'maxVelocity',
  'maxTargetRange',
]);

export function isAbsentValue(row: CompareRow, position: number | null): boolean {
  if (position === null) return true;
  const value = row.values[position];
  if (value === undefined || Number.isNaN(value)) return true;
  return value === 0 && NONE_WHEN_ZERO.has(row.key);
}

export function formatCompareValue(row: CompareRow, position: number, t: Translate): string {
  if (isAbsentValue(row, position)) return '—';
  const value = row.values[position]!;
  if (row.key === 'capacitor') {
    return value >= 0
      ? t('fittings.compare.stat.capacitorStable', { pct: fixed0(value) })
      : t('fittings.compare.stat.capacitorUnstable', { time: formatSeconds(-value) });
  }
  if (FLAG_STATS.has(row.key)) return flagWord(value, t);
  if (row.key === 'appliedDps' || row.key === 'bestRange') return fixed1(value);
  if (row.key === 'priceSell' || row.key === 'priceBuy') return formatIsk(value, 0);
  return fixedFormat(STAT_DIGITS[row.key])(value);
}

export function compareDelta(row: CompareRow, position: number | null): BaselineDelta | null {
  if (position === null || position === 0 || row.key === 'capacitor') return null;
  if (isAbsentValue(row, position) || isAbsentValue(row, 0)) return null;
  return baselineDelta(row.values[position]!, row.values[0]!, row.direction);
}

export const DELTA_TONE_CLASS = {
  better: 'text-success',
  worse: 'text-danger',
  neutral: 'text-text-dim',
} as const;

export const COMPARE_GRID_CLASS =
  'grid gap-x-4 md:grid-cols-[minmax(8rem,12rem)_repeat(var(--compare-fits),minmax(0,1fr))]';

export function compareGridStyle(fits: number): CSSProperties {
  return { '--compare-fits': fits } as CSSProperties;
}

export function compareLetter(slotIndex: number): string {
  return String.fromCharCode(65 + slotIndex);
}
