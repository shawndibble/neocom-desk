/**
 * The ways out of one open sell order, priced against its Order Floor —
 * "is there a better exit?" in the detail modal.
 *
 * Every row is a real number this app can stand behind, or it is absent.
 *
 * Hauling is answered by `hubHaulGaps` rather than by an `OrderExit`: what a
 * trade hub pays is knowable, what moving the stock there costs is not, so a
 * hub is offered as a price and a distance to judge, never as a net the app
 * pretends to have costed.
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
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import type { TradeHub } from '@/market/hubs';
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

/** One trade hub's standing offer for this item, as the modal has resolved it. */
export interface HubBuyPrice {
  hubId: TradeHub['id'];
  /** Short system name, e.g. "Amarr" — what the row is labelled with. */
  systemName: string;
  stationId: number;
  /** Best buy order AT the hub station, or null when the hub has none. */
  buyMax: number | null;
  /** Undefined until the route resolves, or when this order's own system is unknown (a player structure). */
  jumps?: JumpsAwayResult;
}

export interface HubHaulGap {
  hubId: TradeHub['id'];
  systemName: string;
  /** What the hub's best buy order pays a unit. */
  price: number;
  /** ISK a unit more than the best exit available here and now, before any hauling cost. */
  overLocal: number;
  /** `overLocal` across the stock still on the order. */
  totalIsk: number;
  /** Profit a unit against the fill floor, or null when no build is linked and there is no floor to beat. */
  netPerUnit: number | null;
  jumps?: JumpsAwayResult;
}

export interface HubHaulGapsInput {
  row: OpenOrderRow;
  hubs: readonly HubBuyPrice[];
  /** The region order book, once fetched — the only source of buy orders. */
  competitors?: readonly CompetingOrder[];
}

/**
 * Trade hubs whose buy orders pay more for this stock than anything it can be
 * sold into where it sits — "haul it there?", stated as a gap and a distance.
 *
 * Two things make this standable-behind under the rule the rest of the file
 * follows. Fuzzwork is queried `?station={hub}`, so `buyMax` is an order AT
 * the hub station, the same own-station restriction `bestLocalBuyPrice`
 * applies here; and the number offered is a price gap, which needs no view of
 * what a courier charges. The hauling cost is the player's to judge, and the
 * modal says so.
 *
 * The comparison is against the best IMMEDIATE local exit — the best buy
 * order at this station, or, when there is none, the price this order is
 * already asking. Never against `hold`'s optimistic ask when a buy order
 * exists: a hub that beats every real bid here is a real answer even if it
 * sits under a listing that may never fill.
 *
 * Unlike every `OrderExit`, a gap survives a missing Order Floor: `netPerUnit`
 * goes null and `overLocal` still stands, because a hub paying more than the
 * local bid is true whether or not a build is linked.
 */
export function hubHaulGaps({ row, hubs, competitors }: HubHaulGapsInput): HubHaulGap[] {
  if (row.isBuyOrder) return [];
  const local = (competitors ? bestLocalBuyPrice(row, competitors) : null) ?? row.price;

  return hubs
    .filter((hub) => hub.stationId !== row.locationId)
    .flatMap((hub) => {
      if (hub.buyMax === null || hub.buyMax <= local) return [];
      return [
        {
          hubId: hub.hubId,
          systemName: hub.systemName,
          price: hub.buyMax,
          overLocal: hub.buyMax - local,
          totalIsk: (hub.buyMax - local) * row.volumeRemain,
          netPerUnit: row.floor ? hub.buyMax - row.floor.fill : null,
          ...(hub.jumps ? { jumps: hub.jumps } : {}),
        },
      ];
    })
    .sort((a, b) => b.price - a.price);
}
