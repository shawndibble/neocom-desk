import type { JournalRow } from '@/engine/journalNetting';
import { utcDay } from '@/engine/netWorth/snapshot';

export function journalDayKey(entry: Pick<JournalRow, 'date'>): string | null {
  const time = new Date(entry.date).getTime();
  return Number.isNaN(time) ? null : utcDay(time);
}

export function newestJournalDays(rows: readonly JournalRow[], count: number): string[] {
  const days = new Set<string>();
  for (const row of rows) {
    const day = journalDayKey(row);
    if (day) days.add(day);
  }
  return [...days].sort().reverse().slice(0, count);
}

export function journalDayLabel(dayKey: string, locale?: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${dayKey}T00:00:00Z`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}`;
}
