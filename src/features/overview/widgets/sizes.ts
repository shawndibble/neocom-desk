import type { WidgetSize } from './kinds';

export const SIZES: readonly WidgetSize[] = ['S', 'M', 'L', 'F'];

export const SIZE_LAYOUT: Record<WidgetSize, { basis: number; minWidth: number }> = {
  S: { basis: 1 / 4, minWidth: 220 },
  M: { basis: 1 / 3, minWidth: 300 },
  L: { basis: 1 / 2, minWidth: 440 },
  F: { basis: 1, minWidth: 0 },
};

export const chartHeight: Record<WidgetSize, number> = { S: 44, M: 70, L: 100, F: 100 };
