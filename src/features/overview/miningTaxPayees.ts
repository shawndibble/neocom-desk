/**
 * Who is owed what, from the Mining Tax snapshot: the Overview's Mining tax
 * Table groups every still-outstanding assignment by payee. Pure (the loader
 * hands in the rows and the payee names), so the grouping is pinned by a plain
 * test.
 */
import { DAY_MS } from '@/lib/age';

export interface PayeeOwed {
  /** Empty for an outstanding assignment that names no payee. */
  payeeId: string;
  /** The payee's name; empty with no payee, the id itself once a payee was deleted. */
  name: string;
  unpaidIsk: number;
  /** Whole days since the oldest outstanding entry, or null when its date is unreadable. */
  oldestDays: number | null;
  /** Outstanding assignments: a split entry counts once per assignment. */
  entries: number;
}

interface OwedRow {
  entry: { date: string };
  assignments: readonly { status: string; taxOwed: number; payeeId?: string }[];
}

/** Outstanding assignments grouped by payee, the most owed first. */
export function payeesOwed(
  rows: readonly OwedRow[],
  names: ReadonlyMap<string, string>,
  now: number
): PayeeOwed[] {
  const byPayee = new Map<string, { isk: number; oldestMs: number | null; entries: number }>();
  for (const row of rows) {
    const entryMs = Date.parse(row.entry.date);
    for (const assignment of row.assignments) {
      if (assignment.status !== 'outstanding') continue;
      const key = assignment.payeeId ?? '';
      const group = byPayee.get(key) ?? { isk: 0, oldestMs: null, entries: 0 };
      group.isk += assignment.taxOwed;
      group.entries += 1;
      if (!Number.isNaN(entryMs) && (group.oldestMs === null || entryMs < group.oldestMs)) {
        group.oldestMs = entryMs;
      }
      byPayee.set(key, group);
    }
  }
  return [...byPayee.entries()]
    .map(([payeeId, group]) => ({
      payeeId,
      name: payeeId === '' ? '' : (names.get(payeeId) ?? payeeId),
      unpaidIsk: group.isk,
      oldestDays: group.oldestMs === null ? null : Math.floor((now - group.oldestMs) / DAY_MS),
      entries: group.entries,
    }))
    .sort((a, b) => b.unpaidIsk - a.unpaidIsk || a.name.localeCompare(b.name));
}
