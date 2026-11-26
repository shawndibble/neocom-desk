import { fixed2 } from '@/lib/fixedFormat';
import type { ReactNode } from 'react';
import { createNumberFormat } from '@/lib/numberLocale';

const PERCENT_FORMAT = createNumberFormat({
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

export function formatPercent(value: number): string {
  return `${PERCENT_FORMAT(value)}%`;
}

export function formatCostIndex(index: number): string {
  return `${fixed2(index * 100)}%`;
}

const VOLUME_FORMAT = createNumberFormat({ maximumFractionDigits: 1 });

export function formatVolume(value: number): string {
  return `${VOLUME_FORMAT(value)} m³`;
}

export function numericCell(
  value: number | null,
  format: (v: number) => ReactNode,
  unknown: string
): ReactNode {
  return value === null ? unknown : format(value);
}
