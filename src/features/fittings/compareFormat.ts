import type { CSSProperties } from 'react';
import {
  headToHeadRows,
  type BaselineDelta,
  type CompareRow,
} from '@/engine/fittings/fittingCompare';
import { FLAG_STATS, NUMERIC_FIELDS, STAT_DIGITS } from '@/engine/fittings/fittingStatFields';
import { formatSeconds } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { fixed0, fixed1, fixedFormat } from '@/lib/fixedFormat';
import type { Translate } from '@/lib/translate';
import { flagWord } from './flagWord';

const NONE_WHEN_ZERO = new Set<CompareRow['key']>(
  NUMERIC_FIELDS.filter((field) => field.hideWhenNone).map((field) => field.key)
);

export function isAbsentValue(row: CompareRow, index: number): boolean {
  const value = row.values[index];
  if (value === undefined || Number.isNaN(value)) return true;
  return value === 0 && NONE_WHEN_ZERO.has(row.key);
}

export function formatCompareValue(row: CompareRow, index: number, t: Translate): string {
  if (isAbsentValue(row, index)) return '—';
  const value = row.values[index]!;
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

export function formatDelta(delta: BaselineDelta): string {
  const size = Math.abs(delta.percent);
  const text = size >= 10 ? fixed0(size) : fixed1(size);
  return `${delta.percent > 0 ? '+' : '−'}${text}%`;
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

export const HEAD_TO_HEAD_UNIT: Partial<Record<CompareRow['key'], string>> = {
  sustainedTank: 'EHP/s',
  maxVelocity: 'm/s',
  maxTargetRange: 'km',
};

export function headToHeadWins(
  rows: readonly CompareRow[],
  label: (key: CompareRow['key']) => string
): string[][] {
  const wins: string[][] = [];
  for (const row of headToHeadRows(rows)) {
    if (row.bestIndices.length !== 1) continue;
    const winner = row.bestIndices[0]!;
    (wins[winner] ??= []).push(label(row.key));
  }
  return wins;
}
