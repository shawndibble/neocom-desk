/**
 * What a widget Size means, as plain data: a share of one row's width (not a
 * height; content sets height), how many list rows it shows and how tall its
 * chart draws. The grid reads `basis` and `minWidth` for its flex rules.
 */
import type { WidgetSize } from './kinds';

export const SIZES: readonly WidgetSize[] = ['S', 'M', 'L', 'F'];

/**
 * `basis` is the fraction of the row (S four across, M three, L two, Full one);
 * `minWidth` (px) is where it wraps: four S, three M and two L all fit the
 * 1152 px content column of a 1440 px desktop with the rail open.
 */
export const SIZE_LAYOUT: Record<WidgetSize, { basis: number; minWidth: number }> = {
  S: { basis: 1 / 4, minWidth: 220 },
  M: { basis: 1 / 3, minWidth: 300 },
  L: { basis: 1 / 2, minWidth: 440 },
  F: { basis: 1, minWidth: 0 },
};

/** Chart height in px per size. */
export const chartHeight: Record<WidgetSize, number> = { S: 44, M: 70, L: 100, F: 100 };
