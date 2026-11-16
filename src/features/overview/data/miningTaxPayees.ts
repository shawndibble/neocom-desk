/**
 * Who is owed what, for the Overview's Mining tax Table: the Tax tab's own owed balances
 * (`loadOwedBalances`, a Corp Tax Book's overlay applied), reduced to a row per Payee. Pure (the
 * loader hands in the balances), so the shaping is pinned by a plain test.
 */
import { DAY_MS } from '@/lib/age';

export interface PayeeOwed {
  /** The owed Payee's id (a Corp Tax Book's virtual Payee included). */
  payeeId: string;
  /** The payee's name. */
  name: string;
  unpaidIsk: number;
  /** Whole days since the oldest owed entry, or null when its date is unreadable. */
  oldestDays: number | null;
  /** Owed assignments: a split entry counts once per assignment. */
  entries: number;
}

/** The slice of a `PayeeBalance` this reads. */
export interface OwedBalance {
  payee: { id: string; name: string };
  owed: number;
  members: readonly { assignment: { date: string } }[];
}

/** The oldest owed entry's date in ms, over `balances`; null when none is readable. */
export function oldestOwedMs(balances: readonly OwedBalance[]): number | null {
  let oldest: number | null = null;
  for (const b of balances) {
    if (b.owed <= 0) continue;
    for (const m of b.members) {
      const ms = Date.parse(m.assignment.date);
      if (!Number.isNaN(ms) && (oldest === null || ms < oldest)) oldest = ms;
    }
  }
  return oldest;
}

/** The Payees owed anything, the most owed first. */
export function payeesOwed(balances: readonly OwedBalance[], now: number): PayeeOwed[] {
  return balances
    .filter((b) => b.owed > 0)
    .map((b) => {
      const oldest = oldestOwedMs([b]);
      return {
        payeeId: b.payee.id,
        name: b.payee.name,
        unpaidIsk: b.owed,
        oldestDays: oldest === null ? null : Math.floor((now - oldest) / DAY_MS),
        entries: b.members.length,
      };
    })
    .sort((a, b) => b.unpaidIsk - a.unpaidIsk || a.name.localeCompare(b.name));
}
