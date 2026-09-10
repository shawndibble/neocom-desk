/**
 * Reserved gutter for a Recharts Y-axis whose ticks are comma-grouped
 * integers ("1,600,000,000" style) — wide enough that the leading digit
 * doesn't render outside the SVG viewBox at phone widths (see #764).
 */
export const GROUPED_NUMBER_Y_AXIS_WIDTH = 95;

/** Left margin to pair with `GROUPED_NUMBER_Y_AXIS_WIDTH` when that axis sits on the chart's left edge. */
export const GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT = 8;
