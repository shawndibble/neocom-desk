const MIN_BAR_PERCENT = 3;

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
