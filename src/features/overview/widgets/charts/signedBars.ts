const MIN_BAR_PERCENT = 3;
export const LABEL_CHAR_PX = 7;
const LABEL_LINE_PX = 11;
const LABEL_OFFSET_PX = 2;

export interface SignedBar {
  from: number;
  size: number;
  negative: boolean;
}

export interface SignedBarGeometry {
  bars: SignedBar[];
  baseline: number;
  ref: number | null;
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

export function labelClearsBars(
  bars: readonly SignedBar[],
  index: number,
  labelChars: number,
  widthPx: number,
  heightPx: number
): boolean {
  const bar = bars[index];
  if (!bar) return false;
  const slot = widthPx / bars.length;
  const half = (labelChars * LABEL_CHAR_PX) / 2;
  const left = (index + 0.5) * slot - half;
  const right = left + 2 * half;
  const bottom = bar.negative
    ? (bar.from / 100) * heightPx - LABEL_OFFSET_PX - LABEL_LINE_PX
    : ((bar.from + bar.size) / 100) * heightPx + LABEL_OFFSET_PX;
  const top = bottom + LABEL_LINE_PX;
  return bars.every((other, j) => {
    if (j === index || other.size === 0) return true;
    const overlapsX = j * slot < right && (j + 1) * slot > left;
    const overlapsY =
      (other.from / 100) * heightPx < top && ((other.from + other.size) / 100) * heightPx > bottom;
    return !(overlapsX && overlapsY);
  });
}
