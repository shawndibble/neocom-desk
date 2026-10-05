export interface AllocatableEntry {
  id: string;
  /** EVE date mined — oldest is paid first. */
  date: string;
  taxOwed: number;
}

export interface Allocation {
  /** Entries the amount pays in full, oldest first. */
  coveredIds: string[];
  coveredTotal: number;
  /** What the amount leaves over after the covered entries — an overpayment, or not enough for the next one. */
  leftover: number;
}

/**
 * "Sent a different amount?" on Settle up (scope decision 20261004): which
 * owed entries an in-game transfer actually pays. Oldest first, and only
 * entries it pays in full — an Assignment is either paid or owed, never half
 * of each, so an entry the remainder can't cover stays owed, along with every
 * newer one after it (skipping ahead to a cheaper, newer entry would leave an
 * older debt standing for no reason the pilot chose).
 *
 * Half an ISK of slack per entry, because the transfer is whole ISK and the
 * stored tax owed is not.
 */
export function allocateOldestFirst(
  entries: readonly AllocatableEntry[],
  amount: number
): Allocation {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const coveredIds: string[] = [];
  let coveredTotal = 0;
  if (!Number.isFinite(amount) || amount <= 0) return { coveredIds, coveredTotal, leftover: 0 };
  for (const entry of sorted) {
    if (coveredTotal + entry.taxOwed > amount + 0.5 * (coveredIds.length + 1)) break;
    coveredIds.push(entry.id);
    coveredTotal += entry.taxOwed;
  }
  return { coveredIds, coveredTotal, leftover: Math.max(0, amount - coveredTotal) };
}
