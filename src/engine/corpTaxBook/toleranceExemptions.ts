/**
 * An officer's decision on how much of one Miner's day shortfall the book forgives, in place of the
 * book's per-day tolerance (a percent). `forgive` is the most ISK of that day's shortfall that is
 * forgiven: 0 charges the whole shortfall ("reverse" a Market adjustment), another amount forgives
 * up to it and leaves the rest owed ("edit"). Records are never deleted: the newest one for a
 * Miner's day decides.
 */
export interface ToleranceExemption {
  id: string;
  minerId: string;
  /** The mined day whose shortfall it governs, `YYYY-MM-DD`. */
  date: string;
  /** The most ISK of the day's shortfall to forgive. */
  forgive: number;
  reason: string;
  by: number;
  at: string;
}

/** What each of a Miner's days may forgive, by date: the newest exemption for a day wins. */
export function exemptionsOf(
  exemptions: readonly ToleranceExemption[] | undefined,
  minerId: string
): Map<string, number> {
  const newest = new Map<string, ToleranceExemption>();
  for (const e of exemptions ?? []) {
    if (e.minerId !== minerId) continue;
    const held = newest.get(e.date);
    if (!held || e.at > held.at || (e.at === held.at && e.id > held.id)) newest.set(e.date, e);
  }
  return new Map([...newest].map(([date, e]) => [date, e.forgive]));
}
