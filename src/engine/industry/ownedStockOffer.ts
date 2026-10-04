/**
 * The owned-stock offer: whether a materials row shows "Use assets", what it
 * writes, and "Use all" / "Use none" / Undo defined over every row at once.
 *
 * One rule for both tables and both bulk actions, so a row's offer and
 * "Use all" can't disagree again (#2509, #2538). Both tables only render
 * what this module answers.
 *
 * Store-agnostic: a row's current value is read through `ownedFor`, and every
 * bulk action returns `OwnedStockChange`s (`from` → `to`) rather than writing
 * anything. Plan sourcing and the Group Owned Overlay each turn those into
 * their own write (`planMaterialsView.ts`), so "Use none"'s `to: 0` is stored
 * as a 0 on a plan and as a removed entry in the overlay — each store's own
 * rule for an empty count, unchanged — and Undo is the same changes reversed.
 */

import { suggestedOwnedQuantity } from './ownedStock';

/**
 * A materials row as the offer sees it. `acquisitionTier` marks a Blueprint
 * Acquisition row (issue #838), whose ownership comes from the Character's
 * real BPO/BPC rather than a typed Have.
 */
export interface OwnedStockOfferRow {
  typeID: number;
  quantity: number;
  acquisitionTier?: { me: number; te: number };
}

/** A row's stored owned quantity; `undefined` when nothing is stored. */
export type OwnedQuantityFor = (typeID: number) => number | undefined;

/**
 * A material's detected stock narrowed to the owned-stock scope — the one
 * input both the per-row offer and "Use all" read (`OwnedStockDetection`'s
 * `scopedQuantityFor` on both tables).
 */
export type ScopedQuantityFor = (typeID: number) => number;

/** One row's owned quantity going from `from` to `to`; `undefined` is "nothing stored". */
export interface OwnedStockChange {
  typeID: number;
  from: number | undefined;
  to: number | undefined;
}

/** A change "Use all" / "Use none" makes: always to a number, never to "nothing stored". */
export type OwnedStockWrite = OwnedStockChange & { to: number };

/**
 * What this row's "Use assets" writes, or `null` when the offer is not
 * showing: a blueprint row, no scoped stock to write, or the row already
 * holding exactly that number.
 *
 * It writes the scoped stock capped at what the row needs
 * (`suggestedOwnedQuantity`), never the raw total. A typed count — a 0 from
 * "Use none" included — is offered a refresh like any other row.
 */
export function ownedStockOffer(
  row: OwnedStockOfferRow,
  scopedQuantity: number,
  owned: number | undefined
): number | null {
  if (row.acquisitionTier !== undefined) return null;
  const offer = suggestedOwnedQuantity(scopedQuantity, row.quantity);
  return offer > 0 && offer !== owned ? offer : null;
}

/**
 * "Use all": every row's own offer at once — exactly the rows showing
 * "Use assets", each going to what that offer writes. Pass every row on the
 * table; which rows bulk may reach is this rule's call, not the caller's.
 */
export function takeEveryOffer(
  rows: readonly OwnedStockOfferRow[],
  ownedFor: OwnedQuantityFor,
  scopedQuantityFor: ScopedQuantityFor
): OwnedStockWrite[] {
  const changes: OwnedStockWrite[] = [];
  for (const row of rows) {
    const from = ownedFor(row.typeID);
    const to = ownedStockOffer(row, scopedQuantityFor(row.typeID), from);
    if (to !== null) changes.push({ typeID: row.typeID, from, to });
  }
  return changes;
}

/**
 * "Use none": every row carrying a non-zero owned quantity goes to 0,
 * hand-typed or filled by "Use all" alike (issue #612).
 *
 * Deliberately wider than the offer, a blueprint row included: clearing means
 * clearing whatever the row holds, so a value the offer would never write
 * still has a way out. A row already at 0, or holding nothing, is left out.
 */
export function clearEveryOwned(
  rows: readonly { typeID: number }[],
  ownedFor: OwnedQuantityFor
): OwnedStockWrite[] {
  const changes: OwnedStockWrite[] = [];
  for (const { typeID } of rows) {
    const from = ownedFor(typeID);
    if (from !== undefined && from !== 0) changes.push({ typeID, from, to: 0 });
  }
  return changes;
}

/** The changes that put every row back to what it held before `changes`. */
export function undoOwnedStockChanges(changes: readonly OwnedStockChange[]): OwnedStockChange[] {
  return changes.map(({ typeID, from, to }) => ({ typeID, from: to, to: from }));
}
