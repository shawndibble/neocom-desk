import type { OreLine } from './types';

export interface AssignmentValue {
  /** Sum of quantity * unit price across every ore line. */
  estimatedValue: number;
  /** `estimatedValue * taxPct / 100`. */
  taxOwed: number;
}

/**
 * Values a set of ore lines at the given per-unit prices (Jita sell, per the
 * decision doc) and applies a tax percent — computed once, at assignment
 * time, and stored on the Assignment record rather than recomputed on render
 * (invoice semantics: a later price move or a Payee's default-rate edit must
 * not retroactively change what an already-assigned obligation shows as
 * owed). A type with no known price contributes zero rather than throwing —
 * Jita price lookups can legitimately miss a type Fuzzwork has no orders for.
 */
export function computeAssignmentValue(
  oreLines: readonly OreLine[],
  unitPrices: ReadonlyMap<number, number>,
  taxPct: number
): AssignmentValue {
  const estimatedValue = oreLines.reduce(
    (sum, line) => sum + line.quantity * (unitPrices.get(line.typeId) ?? 0),
    0
  );
  return { estimatedValue, taxOwed: estimatedValue * (taxPct / 100) };
}
