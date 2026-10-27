/** "Oct 2026" for a whole calendar month, else "2–8 Oct 2026" or "28 Sep – 4 Oct 2026". EVE/UTC days. */
export function verifyPeriodLabel(start: string, end: string, locale?: string): string {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  const month = (d: Date) => d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  const year = to.getUTCFullYear();
  const monthEnd = new Date(Date.UTC(year, to.getUTCMonth() + 1, 0)).getUTCDate();
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  if (sameMonth && start.endsWith('-01') && to.getUTCDate() === monthEnd)
    return `${month(to)} ${year}`;
  if (sameMonth) return `${from.getUTCDate()}–${to.getUTCDate()} ${month(to)} ${year}`;
  const yearFrom = from.getUTCFullYear() === year ? '' : ` ${from.getUTCFullYear()}`;
  return `${from.getUTCDate()} ${month(from)}${yearFrom} – ${to.getUTCDate()} ${month(to)} ${year}`;
}
