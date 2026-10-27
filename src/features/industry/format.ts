import { fixed2 } from '@/lib/fixedFormat';
import type { ReactNode } from 'react';
import { createNumberFormat } from '@/lib/numberLocale';

const PERCENT_FORMAT = createNumberFormat({
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

/** Percent with one decimal (e.g. "12.3%"). */
export function formatPercent(value: number): string {
  return `${PERCENT_FORMAT(value)}%`;
}

/** ESI system cost index (a 0..1 fraction) shown as a percent (e.g. "4.64%"). */
export function formatCostIndex(index: number): string {
  return `${fixed2(index * 100)}%`;
}

const VOLUME_FORMAT = createNumberFormat({ maximumFractionDigits: 1 });

/** Material volume in m3 (e.g. "12,345.6 m³") — one decimal, unlike the whole-unit ISK columns beside it, since a small hauling total should not round away to nothing. */
export function formatVolume(value: number): string {
  return `${VOLUME_FORMAT(value)} m³`;
}

/** A nullable figure's cell: `unknown` text for null, never a formatted 0 — shared by both Opportunities tables. */
export function numericCell(
  value: number | null,
  format: (v: number) => ReactNode,
  unknown: string
): ReactNode {
  return value === null ? unknown : format(value);
}
