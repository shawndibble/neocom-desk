const PERCENT_FORMAT = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

/** Percent with one decimal (e.g. "12.3%"). */
export function formatPercent(value: number): string {
  return `${PERCENT_FORMAT.format(value)}%`;
}

/** ESI system cost index (a 0..1 fraction) shown as a percent (e.g. "4.64%"). */
export function formatCostIndex(index: number): string {
  return `${(index * 100).toFixed(2)}%`;
}

const VOLUME_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

/** Material volume in m3 (e.g. "12,345.6 m³") — one decimal, unlike the whole-unit ISK columns beside it, since a small hauling total should not round away to nothing. */
export function formatVolume(value: number): string {
  return `${VOLUME_FORMAT.format(value)} m³`;
}
