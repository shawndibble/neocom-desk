import { DAY_MS } from '@/lib/age';

export const VITALS_WINDOW_DAYS = 30;

const WINDOW_MS = VITALS_WINDOW_DAYS * DAY_MS;

export interface VitalsDivisionBalance {
  balance: number;
}

export interface VitalsJournalEntry {
  atMs: number;
  amount: number;
}

export function totalBalance(divisions: readonly VitalsDivisionBalance[]): number {
  return divisions.reduce((sum, division) => sum + division.balance, 0);
}

function withinWindow(
  entries: readonly VitalsJournalEntry[],
  nowMs: number
): readonly VitalsJournalEntry[] {
  const from = nowMs - WINDOW_MS;
  return entries.filter((entry) => entry.atMs >= from && entry.atMs <= nowMs);
}

export function netOverWindow(entries: readonly VitalsJournalEntry[], nowMs: number): number {
  return withinWindow(entries, nowMs).reduce((sum, entry) => sum + entry.amount, 0);
}

export function dailyOutgoings(entries: readonly VitalsJournalEntry[], nowMs: number): number {
  const spent = withinWindow(entries, nowMs)
    .filter((entry) => entry.amount < 0)
    .reduce((sum, entry) => sum + entry.amount, 0);
  return Math.abs(spent) / VITALS_WINDOW_DAYS;
}

export function runwayDays(balance: number, outgoingsPerDay: number): number | null {
  if (outgoingsPerDay <= 0 || balance <= 0) return null;
  return balance / outgoingsPerDay;
}
