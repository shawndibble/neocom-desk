/** A fraction as a percent, to two places and no trailing zeros: 0.545 -> "54.5%". */
export function formatPercent(fraction: number, withSign = true): string {
  const text = String(Number((fraction * 100).toFixed(2)));
  return withSign ? `${text}%` : text;
}
