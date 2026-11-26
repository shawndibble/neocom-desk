import type { OpenOrderRow } from './openOrdersModel';
import type { CompetingOrder } from '@/engine/market/undercut';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { TradeHub } from '@/market/hubs';
import type { ReprocessingType } from '@/sde/types';
import { reprocessingValue, reprocessingYield } from '@/engine/industry/reprocessing';
import {
  DEFAULT_REFINING_SETUP,
  netOfReprocessingTax,
  type RefiningSetup,
} from '@/engine/industry/refiningSetup';
import { refiningEfficiency, type CharacterModifiers } from '@/engine/industry/characterModifiers';
import { undercutPrice } from '@/engine/market/priceTick';
import { buyOrderReaches, walkSellIntoBuys } from '@/engine/market/buyReach';

export type OrderExitKind = 'hold' | 'undercutStation' | 'dumpToBuyOrder' | 'reprocess';

export interface OrderExit {
  kind: OrderExitKind;
  price: number;
  netPerUnit: number;
  partial?: boolean;
  unitsLeftOver?: number;
  dump?: DumpWalk;
}

export interface DumpWalk {
  topBid: number;
  topBidTakes: number;
  units: number;
  unsold: number;
  movedPrice: boolean;
}

export interface ReprocessingInput {
  entry: ReprocessingType;
  modifiers: CharacterModifiers;
  materialPrices: Readonly<Record<number, number>>;
  refining?: RefiningSetup;
}

export interface OrderExitsInput {
  row: OpenOrderRow;
  competitors?: readonly CompetingOrder[];
  reprocessing?: ReprocessingInput;
  buyJumps?: ReadonlyMap<number, number>;
}

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

export function stationSystemId(row: OpenOrderRow, competitors: readonly CompetingOrder[]): number {
  return competitors.find((c) => c.locationId === row.locationId)?.systemId ?? 0;
}

function dumpExit(
  row: OpenOrderRow,
  competitors: readonly CompetingOrder[],
  jumps: ReadonlyMap<number, number> | undefined
): OrderExit | null {
  if (!row.floor) return null;
  const station = { locationId: row.locationId, systemId: stationSystemId(row, competitors) };
  const reaching = competitors.filter((c) => c.isBuyOrder && buyOrderReaches(c, station, jumps));
  const walk = walkSellIntoBuys(reaching, row.volumeRemain);
  if (walk.average === null || walk.topBid === null) return null;
  return {
    kind: 'dumpToBuyOrder',
    price: walk.average,
    netPerUnit: walk.average - row.floor.fill,
    dump: {
      topBid: walk.topBid,
      topBidTakes: walk.topBidTakes,
      units: walk.filled,
      unsold: walk.unsold,
      movedPrice: walk.movedPrice,
    },
  };
}

function reprocessExit(row: OpenOrderRow, input: ReprocessingInput): OrderExit | null {
  if (!row.floor) return null;
  const refining = input.refining ?? DEFAULT_REFINING_SETUP;
  const efficiency = refiningEfficiency(
    input.modifiers,
    input.entry.specialisationSkillID,
    refining.stationRate
  );
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
  const price = netOfReprocessingTax(value.total, refining.taxRate) / yielded.unitsRefined;
  return {
    kind: 'reprocess',
    price,
    netPerUnit: price - row.floor.fill,
    partial: !value.pricedAll,
    unitsLeftOver: yielded.unitsLeftOver,
  };
}

export function orderExits({
  row,
  competitors,
  reprocessing,
  buyJumps,
}: OrderExitsInput): OrderExit[] {
  if (row.isBuyOrder || !row.floor) return [];
  const exits: OrderExit[] = [
    { kind: 'hold', price: row.price, netPerUnit: row.price - row.floor.fill },
  ];

  const rivalPrice = row.deepUndercut?.byScope.station?.price ?? row.station.bestPrice;
  if (rivalPrice !== null && rivalPrice !== undefined && row.station.beatsMe) {
    const price = undercutPrice(rivalPrice);
    if (price !== null) {
      exits.push({
        kind: 'undercutStation',
        price,
        netPerUnit: price - row.floor.relist,
      });
    }
  }

  const dump = competitors ? dumpExit(row, competitors, buyJumps) : null;
  if (dump) exits.push(dump);

  if (reprocessing) {
    const refine = reprocessExit(row, reprocessing);
    if (refine) exits.push(refine);
  }

  return exits;
}

export interface HubBuyPrice {
  hubId: TradeHub['id'];
  systemName: string;
  stationId: number;
  buyMax: number | null;
  jumps?: JumpsAwayResult;
}

export interface HubHaulGap {
  hubId: TradeHub['id'];
  systemName: string;
  price: number;
  overLocal: number;
  totalIsk: number;
  netPerUnit: number | null;
  jumps?: JumpsAwayResult;
}

export interface HubHaulGapsInput {
  row: OpenOrderRow;
  hubs: readonly HubBuyPrice[];
  competitors?: readonly CompetingOrder[];
}

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
