/** When a UTC day stops taking late ore, as HH:MM EVE time: 00:00 plus the book's grace. */
export function dayEndTime(graceHours: number): string {
  const minutes = Math.round(graceHours * 60) % (24 * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
