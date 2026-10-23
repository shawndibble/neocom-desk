/**
 * Column widths for a windowed `DataTable` (`DataTableColumn.width`). `ch` is
 * one digit's width, so each follows the font scale. Sized for the longest
 * realistic value of the kind; the table adds the cell's horizontal padding.
 */

/** Cell padding both sides, in rem: `px-3`, or `px-2` for `density="compact"`. */
const cellPadRem = (density: 'default' | 'compact') => (density === 'compact' ? 1 : 1.5);

/** A column's `<th>` width: its content width plus the cell padding (border-box). */
export function columnCellWidth(width: string, density: 'default' | 'compact'): string {
  return `calc(${width} + ${cellPadRem(density)}rem)`;
}

/** Room for the expand chevron and row-actions columns, in rem. */
export const TRAILING_COL_EXPAND_REM = 2;
export const TRAILING_COL_ACTIONS_REM = 2.5;

/** `formatTimestamp` on one line: `12/31/2026, 11:59 PM`, 20 characters. */
export const COL_DATETIME = '21ch';
/** Date over time on two lines; the date is the longer one. */
export const COL_DATETIME_STACKED = '11ch';
/** `2026-10-23` alone. */
export const COL_DATE = '11ch';
/** Full ISK figure, up to `999,999,999,999.99`. */
export const COL_ISK = '19ch';
/** Whole-number quantity, up to nine digits with commas. */
export const COL_QUANTITY = '12ch';
/** Percent or small figure. */
export const COL_SMALL_NUMBER = '8ch';
/** One icon or badge. */
export const COL_ICON = '5ch';
