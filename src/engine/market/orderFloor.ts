/**
 * The lowest price a sell order is worth taking, given what the goods cost
 * the player (from a linked Production Run, or a hand-entered cost). This is
 * NOT one number: re-pricing an order and letting one fill differ in which
 * fee actually gets paid again, so a single "floor" would either scare the
 * player off a fill that is still profitable, or bait them into relisting at
 * a loss.
 *
 * - `relist`: the floor for typing in a NEW price (editing an order, or
 *   listing a fresh one). Both sales tax and a broker fee are still ahead of
 *   you, so this composes `breakEvenPrice` from fees.ts wholesale — including
 *   its 100 ISK minimum-broker-fee re-solve — rather than re-deriving any of
 *   that math here.
 * - `fill`: the floor for leaving an already-listed order alone and letting
 *   it sell. The broker fee was already paid at listing time, so only sales
 *   tax stands between the sale price and the player's pocket.
 *
 * `fill` is always <= `relist` for this reason: relist pays a broker fee on
 * top of tax, fill pays tax alone.
 */

import { breakEvenPrice, salesTaxPct } from '@/engine/industry/fees';

export interface OrderFloorInputs {
  /** What one unit cost the player, from a linked Production Run or a hand-entered cost. */
  unitCost: number;
  accountingLevel: number;
  brokerRelationsLevel: number;
  factionStanding?: number;
  corpStanding?: number;
}

export interface OrderFloor {
  /** Lowest price worth RE-PRICING to: sales tax plus a broker fee charged again on the edit. */
  relist: number;
  /** Lowest price worth letting it FILL at: sales tax only, because the broker fee was paid at listing. */
  fill: number;
}

/** Null when there is no usable cost basis (unitCost <= 0 or not finite). */
export function orderFloor(inputs: OrderFloorInputs): OrderFloor | null {
  const { unitCost, accountingLevel, brokerRelationsLevel, factionStanding, corpStanding } = inputs;

  if (!Number.isFinite(unitCost) || unitCost <= 0) return null;

  const relist = breakEvenPrice(
    unitCost,
    1,
    accountingLevel,
    brokerRelationsLevel,
    factionStanding,
    corpStanding
  );
  // quantity 1 > 0, so breakEvenPrice never returns null here.
  const tax = salesTaxPct(accountingLevel);
  const fill = unitCost / (1 - tax / 100);

  return { relist: relist as number, fill };
}
