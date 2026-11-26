export function formatPercent(fraction: number, withSign = true): string {
  const text = String(Number((fraction * 100).toFixed(2)));
  return withSign ? `${text}%` : text;
}
