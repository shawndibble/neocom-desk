/**
 * What a widget Size means, as plain data: a share of one row's width (not a
 * height; content sets height), how many list rows it shows and how tall its
 * chart draws. The grid reads `basis` and `minWidth` for its flex rules.
 */
import type { WidgetSize } from './kinds';

export const SIZES: readonly WidgetSize[] = ['S', 'M', 'L', 'F'];

/** `basis` is the fraction of the row; `minWidth` (px) is where it wraps. */
export const SIZE_LAYOUT: Record<WidgetSize, { basis: number; minWidth: number }> = {
  S: { basis: 1 / 3, minWidth: 190 },
  M: { basis: 1 / 2, minWidth: 260 },
  L: { basis: 2 / 3, minWidth: 340 },
  F: { basis: 1, minWidth: 0 },
};

/** List rows shown per size. */
export const rowsForSize: Record<WidgetSize, number> = { S: 3, M: 4, L: 6, F: 10 };

/** Chart height in px per size. */
export const chartHeight: Record<WidgetSize, number> = { S: 44, M: 70, L: 100, F: 100 };
