import type { OreLine, QuantityDiff } from './types';

/**
 * Compares an Assignment's snapshotted ore lines against a fresh read of the
 * same Mining Ledger Entry, and reports every type whose quantity strictly
 * *grew* — the decision doc's trigger for flipping an Assignment to
 * `needs-review`. Equal or lower quantities never flip: ESI's own ledger only
 * ever grows for a given (date, system) key as late-arriving data settles, and
 * a wrong bulk action on real ISK obligations must never be a false positive.
 *
 * A type present in `fresh` but absent from `assigned` counts as growth from
 * zero — the same late-arriving-data case, just for a type this Assignment
 * never saw at all.
 */
export function diffAssignedOreLines(
  assigned: readonly OreLine[],
  fresh: readonly OreLine[]
): QuantityDiff[] {
  const before = new Map(assigned.map((line) => [line.typeId, line.quantity]));
  const diffs: QuantityDiff[] = [];

  for (const line of fresh) {
    const previous = before.get(line.typeId) ?? 0;
    if (line.quantity > previous) {
      diffs.push({ typeId: line.typeId, before: previous, after: line.quantity });
    }
  }

  return diffs.sort((a, b) => a.typeId - b.typeId);
}
