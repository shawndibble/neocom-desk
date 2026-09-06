import type { OreLine } from './types';

export type MiningTaxRowStatus =
  'unassigned' | 'outstanding' | 'paid' | 'needs-review' | 'dismissed';

/**
 * The entry's ore lines whose typeId no covering Assignment claims at all —
 * the split-payee residual (decision doc: "one derived entry split across two
 * Payees"). Presence-based, not quantity-based: a split assigns a *whole* ore
 * line to a Payee, never a partial quantity of one, so a typeId any covering
 * Assignment already names is fully spoken for regardless of how much
 * quantity that Assignment's own snapshot holds.
 *
 * This matters most for a `needs-review` Assignment, whose stored quantity is
 * stale by definition: `resolveNeedsReview` (assignments.ts) always
 * re-snapshots to the type's *entire* fresh quantity, so treating only the
 * already-stored amount as "covered" here would double-count the pending
 * growth as a second, separately assignable "unassigned" residual — a real
 * defect this function used to have (caught by `snapshot.test.ts`), not a
 * quantity computation worth doing.
 */
export function unassignedOreLines(
  entryLines: readonly OreLine[],
  coveringOreLines: readonly (readonly OreLine[])[]
): OreLine[] {
  const coveredTypeIds = new Set<number>();
  for (const lines of coveringOreLines) {
    for (const line of lines) coveredTypeIds.add(line.typeId);
  }
  return entryLines.filter((line) => !coveredTypeIds.has(line.typeId));
}

/**
 * The subset of `freshLines` whose typeId `assignedLines` claims — the fresh,
 * current-truth counterpart of an Assignment's own (possibly stale) ore
 * lines. Shared by `reconcile.ts` (diffing an Assignment against a fresh
 * ledger read) and `assignments.ts`'s `resolveNeedsReview` (re-snapshotting
 * to it): both need exactly "what does the fresh entry say now, for only the
 * types this Assignment already covers" — never lines a *different* Payee's
 * Assignment claims.
 */
export function linesClaimedBy(
  assignedLines: readonly OreLine[],
  freshLines: readonly OreLine[]
): OreLine[] {
  return freshLines.filter((line) =>
    assignedLines.some((covered) => covered.typeId === line.typeId)
  );
}
