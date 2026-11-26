import { DAY_MS } from '@/lib/age';

export interface PayeeOwed {
  payeeId: string;
  name: string;
  unpaidIsk: number;
  oldestDays: number | null;
  entries: number;
}

export interface OwedBalance {
  payee: { id: string; name: string };
  owed: number;
  members: readonly { assignment: { date: string } }[];
}

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
