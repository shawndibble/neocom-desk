/**
 * Geometry for vertical bars that may dip below a zero axis and carry a
 * reference line (a daily average). Pure, like `geometry.ts`; separate file so
 * the shared geometry module stays untouched.
 */

/** A bar that is not zero is never thinner than this, so a small value still reads as there. */
const MIN_BAR_PERCENT = 3;

export interface SignedBar {
  /** Distance of the bar's bottom edge above the plot floor, in percent of the plot height. */
  from: number;
  /** The bar's height in percent of the plot height. */
  size: number;
  negative: boolean;
}

export interface SignedBarGeometry {
  bars: SignedBar[];
  /** Where the zero axis sits above the floor, in percent; 0 when nothing is negative. */
  baseline: number;
  /** Where the reference line sits above the floor, in percent; null when none was asked for or it cannot be placed. */
  ref: number | null;
  /** Index of the first tallest positive bar; null when no bar is above zero. */
  peak: number | null;
}

export function signedBarGeometry(values: readonly number[], ref?: number): SignedBarGeometry {
  const maxUp = values.reduce((m, v) => Math.max(m, v), 0);
  const maxDown = values.reduce((m, v) => Math.max(m, -v), 0);
  const span = maxUp + maxDown;
  if (span <= 0) {
    return {
      bars: values.map(() => ({ from: 0, size: 0, negative: false })),
      baseline: 0,
      ref: null,
      peak: null,
    };
  }
  const baseline = (maxDown / span) * 100;
  const sizeOf = (v: number) =>
    v === 0 ? 0 : Math.max(MIN_BAR_PERCENT, (Math.abs(v) / span) * 100);
  const bars = values.map((v): SignedBar => {
    const size = sizeOf(v);
    return v < 0
      ? { from: Math.max(0, baseline - size), size, negative: true }
      : { from: baseline, size, negative: false };
  });
  return {
    bars,
    baseline,
    ref: ref === undefined ? null : baseline + (ref / span) * 100,
    peak: maxUp > 0 ? values.indexOf(maxUp) : null,
  };
}
