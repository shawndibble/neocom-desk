export function iskPerMinedDay(totalValue: number, dates: readonly string[]): number | null {
  const days = new Set(dates).size;
  if (days === 0) return null;
  return totalValue / days;
}
