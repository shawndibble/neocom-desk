/**
 * The ways out of one open sell order, priced against its Order Floor —
 * "is there a better exit?" in the detail modal.
 *
 * Every row is a real number this app can stand behind, or it is absent.
 * One exit the design asked for is deliberately NOT here: hauling to the
 * nearest trade hub, since no hub prices are loaded on this page. The modal
 * names it as not built rather than estimating it.
 *
 * Which fee applies is the whole point of the comparison, and the two
 * floors differ by exactly that:
 * - HOLDING and DUMPING into a buy order pay sales tax only. The broker fee
 *   on the listing is already sunk, so `floor.fill` is the break-even.
 * - MATCHING is a price edit, which charges the broker fee a second time,
 *   so `floor.relist` is the break-even.
 * - REPROCESSING and selling the materials into the buy orders that already
 *   exist pays sales tax on that sale, and the broker fee on the listing you
 *   cancel is gone either way — so `floor.fill` again, against the material
 *   revenue a unit of the item turns into.
 */
import type { OpenOrderRow } from './openOrdersModel';
import type { CompetingOrder } from '@/engine/market/undercut';
import type { ReprocessingType } from '@/sde/types';
import {
  reprocessingEfficiency,
  reprocessingValue,
  reprocessingYield,
  type ReprocessingSkills,
} from '@/engine/industry/reprocessing';

export type OrderExitKind = 'hold' | 'matchStation' | 'dumpToBuyOrder' | 'reprocess';

export interface OrderExit {
  kind: OrderExitKind;
  /** The price this exit realises a unit. */
  price: number;
  /** ISK a unit after the fees that exit pays. Positive is profit. */
  netPerUnit: number;
  /** True when at least one material had no price, so `price` is a floor rather than the answer. */
  partial?: boolean;
  /** Units that cannot make up a whole reprocessing portion, and so return nothing. */
  unitsLeftOver?: number;
}

/** What the refine comparison needs: the baked yield, the character's skills, and a price for each material where the stock sits. */
export interface ReprocessingInput {
  entry: ReprocessingType;
  skills: ReprocessingSkills;
  /** materialTypeId -> ISK a unit at this station, generally the best buy order. */
  materialPrices: Readonly<Record<number, number>>;
}

export interface OrderExitsInput {
  row: OpenOrderRow;
  /** The region order book, once fetched — the only source of buy orders. */
  competitors?: readonly CompetingOrder[];
  /** Absent until the refining data and the material prices for this item have loaded. */
  reprocessing?: ReprocessingInput;
}

/**
 * The best buy order sitting at the player's OWN station. Region-wide buy
 * orders are excluded on purpose: a buy order carries a range this app does
 * not read, so one elsewhere in the region may not reach the player's stock
 * at all, and an exit that might not exist is worse than no row.
 */
function bestLocalBuyPrice(
  row: OpenOrderRow,
  competitors: readonly CompetingOrder[]
): number | null {
  let best: number | null = null;
  for (const c of competitors) {
    if (!c.isBuyOrder || c.locationId !== row.locationId) continue;
    if (best === null || c.price > best) best = c.price;
  }
  return best;
}

/**
 * What refining the remaining stock and selling the materials would fetch a
 * unit, or null when it would fetch nothing worth reporting.
 *
 * Priced across the units actually refined, NOT the units on hand: a part
 * portion returns nothing, so dividing by `volumeRemain` would spread real
 * revenue over stock that produced none and understate the exit.
 */
function reprocessExit(row: OpenOrderRow, input: ReprocessingInput): OrderExit | null {
  if (!row.floor) return null;
  const efficiency = reprocessingEfficiency(input.skills);
  const yielded = reprocessingYield({
    portionSize: input.entry.portionSize,
    materials: input.entry.materials.map((m) => ({ typeId: m.typeID, quantity: m.quantity })),
    units: row.volumeRemain,
    efficiency,
  });
  if (yielded.unitsRefined === 0) {
    return {
      kind: 'reprocess',
      price: 0,
      netPerUnit: -row.floor.fill,
      unitsLeftOver: yielded.unitsLeftOver,
    };
  }
  const value = reprocessingValue(yielded.outputs, input.materialPrices);
  const price = value.total / yielded.unitsRefined;
  return {
    kind: 'reprocess',
    price,
    netPerUnit: price - row.floor.fill,
    partial: !value.pricedAll,
    unitsLeftOver: yielded.unitsLeftOver,
  };
}

export function orderExits({ row, competitors, reprocessing }: OrderExitsInput): OrderExit[] {
  if (row.isBuyOrder || !row.floor) return [];
  const exits: OrderExit[] = [
    { kind: 'hold', price: row.price, netPerUnit: row.price - row.floor.fill },
  ];

  const rivalPrice = row.deepUndercut?.byScope.station?.price ?? row.station.bestPrice;
  if (rivalPrice !== null && rivalPrice !== undefined && row.station.beatsMe) {
    exits.push({
      kind: 'matchStation',
      price: rivalPrice,
      netPerUnit: rivalPrice - row.floor.relist,
    });
  }

  const buyPrice = competitors ? bestLocalBuyPrice(row, competitors) : null;
  if (buyPrice !== null) {
    exits.push({
      kind: 'dumpToBuyOrder',
      price: buyPrice,
      netPerUnit: buyPrice - row.floor.fill,
    });
  }

  if (reprocessing) {
    const refine = reprocessExit(row, reprocessing);
    if (refine) exits.push(refine);
  }

  return exits;
}
