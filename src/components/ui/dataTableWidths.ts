/**
 * Column widths for a windowed `DataTable` (`DataTableColumn.width`). `ch` is
 * one digit's width, so each follows the font scale. Sized for the longest
 * realistic value of the kind, plus padding.
 */

/** `2026-10-23 14:05` on one line. */
export const COL_DATETIME = '16ch';
/** Date over time on two lines; the date is the longer one. */
export const COL_DATETIME_STACKED = '10ch';
/** `2026-10-23` alone. */
export const COL_DATE = '10ch';
/** Full ISK figure, up to `999,999,999,999.99`. */
export const COL_ISK = '19ch';
/** Whole-number quantity, up to nine digits with commas. */
export const COL_QUANTITY = '12ch';
/** Percent or small figure. */
export const COL_SMALL_NUMBER = '8ch';
/** One icon or badge. */
export const COL_ICON = '5ch';
