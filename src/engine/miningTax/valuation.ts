import type { OreLine } from './types';

export interface AssignmentValue {
  /** Sum of quantity * unit price across every ore line. */
  estimatedValue: number;
  /** `estimatedValue * taxPct / 100`. */
  taxOwed: number;
}

/**
 * Values a set of ore lines at the given per-unit prices (Jita buy, of each
 * line's Compressed counterpart where one exists — `pricing.ts`) and applies
 * a tax percent — computed once, at assignment
 * time, and stored on the Assignment record rather than recomputed on render
 * (invoice semantics: a later price move or a Payee's default-rate edit must
 * not retroactively change what an already-assigned obligation shows as
 * owed). A type with no known price contributes zero rather than throwing —
 * Jita price lookups can legitimately miss a type Fuzzwork has no orders for.
 *
 * `oreLineValues`, when given, replaces `quantity * unitPrice` with the
 * pilot's own total for whichever lines it names (grilling session,
 * 2026-09-27's "per ore value" setting) — a corp's own moon-tax tool often
 * grabs market price at a different moment than this app does, and the
 * pilot needs the two to reconcile line-for-line rather than only as one
 * lump total. A line the map doesn't cover still prices from `unitPrices` as
 * before.
 */
export function computeAssignmentValue(
  oreLines: readonly OreLine[],
  unitPrices: ReadonlyMap<number, number>,
  taxPct: number,
  oreLineValues?: ReadonlyMap<number, number>
): AssignmentValue {
  const estimatedValue = oreLines.reduce(
    (sum, line) =>
      sum + (oreLineValues?.get(line.typeId) ?? line.quantity * (unitPrices.get(line.typeId) ?? 0)),
    0
  );
  return { estimatedValue, taxOwed: estimatedValue * (taxPct / 100) };
}
