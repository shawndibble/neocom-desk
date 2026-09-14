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
 * six characters rather than thirteen. Never narrow the grouped one to match:
 * an axis that prints every digit clips its leading digit at this width
 * (#764). The market price history holds both — the grouped width where there
 * is room for it, this one on a phone, where two full-width gutters would
 * leave almost no plot between them.
 */
export const COMPACT_ISK_Y_AXIS_WIDTH = 48;

/** Left margin to pair with `COMPACT_ISK_Y_AXIS_WIDTH` when that axis sits on the chart's left edge. */
export const COMPACT_ISK_Y_AXIS_MARGIN_LEFT = 0;

/** Reserved gutter for an axis of plain compact counts (`1.2K`) — the market history's order-count axis. */
export const COMPACT_COUNT_Y_AXIS_WIDTH = 40;
