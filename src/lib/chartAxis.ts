/**
 * Reserved gutter for a Recharts Y-axis whose ticks are comma-grouped
 * integers ("1,600,000,000" style) — wide enough that the leading digit
 * doesn't render outside the SVG viewBox at phone widths (see #764).
 */
export const GROUPED_NUMBER_Y_AXIS_WIDTH = 95;

/** Left margin to pair with `GROUPED_NUMBER_Y_AXIS_WIDTH` when that axis sits on the chart's left edge. */
export const GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT = 8;

/**
 * Reserved gutter for a Recharts Y-axis whose ticks are abbreviated ISK
 * ("1.6B" style, `formatIskCompact`). Roughly half
 * `GROUPED_NUMBER_Y_AXIS_WIDTH`, because the widest compact tick is five or
 * six characters rather than thirteen — the 95px there is still right for an
 * axis that prints every digit (the market price history), and narrowing that
 * one would clip its leading digit again (#764).
 */
export const COMPACT_ISK_Y_AXIS_WIDTH = 48;

/** Left margin to pair with `COMPACT_ISK_Y_AXIS_WIDTH` when that axis sits on the chart's left edge. */
export const COMPACT_ISK_Y_AXIS_MARGIN_LEFT = 0;
