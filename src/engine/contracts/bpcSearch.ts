import { median } from '../math';
import { classifySpace, type SpaceKind } from '@/engine/space';

export interface BpcContractRow {
  contractId: number;
  regionId: number;
  locationId: number;
  typeId: number;
  price: number;
  buyout?: number;
  isAuction: boolean;
  me: number;
  te: number;
  runs: number;
  quantity: number;
  dateExpired: number;
  isMultiType: boolean;
  requestedPlex?: number;
}

export interface BpcSearchFilter {
  typeIds?: ReadonlySet<number> | null;
  regionId?: number | null;
  minMe?: number | null;
  minTe?: number | null;
  minRuns?: number | null;
  maxPrice?: number | null;
  spaceKinds?: ReadonlySet<SpaceKind> | null;
  allowedSystems?: ReadonlySet<number> | null;
  hideAuctions?: boolean | null;
  hidePlexRequests?: boolean | null;
}

export const EMPTY_BPC_SEARCH_FILTER: BpcSearchFilter = {
  typeIds: null,
  regionId: null,
  minMe: null,
  minTe: null,
  minRuns: null,
  maxPrice: null,
  spaceKinds: null,
  allowedSystems: null,
  hideAuctions: null,
  hidePlexRequests: null,
};

function priceForMaxFilter(row: BpcContractRow): number | null {
  if (row.requestedPlex) return null;
  if (!row.isAuction) return row.price;
  return row.buyout ?? null;
}

export type BpcSearchSource = 'contract' | 'owned' | 'market' | 'lp' | 'community';

export interface OwnedBlueprintInput {
  itemId: number;
  typeId: number;
  runs: number;
  me: number;
  te: number;
  quantity: number;
  locationName?: string | null;
  regionId?: number | null;
  space?: SpaceKind | null;
  systemId?: number | null;
}

export type BpcSearchRow =
  | {
      source: 'contract';
      typeId: number;
      me: number;
      te: number;
      runs: number;
      quantity: number;
      contract: BpcContractRow;
      locationName: string | null;
      space: SpaceKind | null;
      systemId: number | null;
    }
  | {
      source: 'owned';
      typeId: number;
      me: number;
      te: number;
      runs: number;
      quantity: number;
      itemId: number;
      locationName: string | null;
      regionId: number | null;
      space: SpaceKind | null;
      systemId: number | null;
    }
  | {
      source: 'market';
      typeId: number;
      me: 0;
      te: 0;
      runs: -1;
      quantity: number;
      orderId: number;
      price: number;
      regionId: number;
      locationId: number;
      atHub: boolean;
      locationName: string | null;
      space: SpaceKind | null;
      systemId: number | null;
    }
  | {
      source: 'lp';
      typeId: number;
      me: 0;
      te: 0;
      runs: null;
      quantity: number;
      corporationId: number;
      offerId: number;
      corpName: string;
      price: number;
      iskCost: number;
      lpCost: number;
      lpPriced: boolean;
      regionId: null;
      locationName: null;
      space: null;
      systemId: number | null;
      stationName: string | null;
    }
  | {
      source: 'community';
      typeId: number;
      me: number;
      te: number;
      runs: number;
      quantity: number;
      price: 0;
      memberUid: string;
      memberName: string;
      communities: { id: string; name: string }[];
      stale: boolean;
      asOf: number | null;
      locationName: string;
      systemName: string;
      regionId: number | null;
      space: SpaceKind | null;
      systemId: number | null;
    };

export interface MarketBpoInput {
  orderId: number;
  typeId: number;
  regionId: number;
  locationId: number;
  price: number;
  volumeRemain: number;
  atHub: boolean;
  locationName?: string | null;
  space?: SpaceKind | null;
  systemId?: number | null;
}

export function marketBpoToSearchRow(order: MarketBpoInput): BpcSearchRow {
  return {
    source: 'market',
    typeId: order.typeId,
    me: 0,
    te: 0,
    runs: -1,
    quantity: order.volumeRemain,
    orderId: order.orderId,
    price: order.price,
    regionId: order.regionId,
    locationId: order.locationId,
    atHub: order.atHub,
    locationName: order.locationName ?? null,
    space: order.space ?? null,
    systemId: order.systemId ?? null,
  };
}

export interface LpOfferInput {
  corporationId: number;
  offerId: number;
  corpName: string;
  typeId: number;
  quantity: number;
  price: number;
  iskCost: number;
  lpCost: number;
  lpPriced: boolean;
}

export function lpOfferToSearchRow(offer: LpOfferInput): BpcSearchRow {
  return {
    source: 'lp',
    typeId: offer.typeId,
    me: 0,
    te: 0,
    runs: null,
    quantity: offer.quantity,
    corporationId: offer.corporationId,
    offerId: offer.offerId,
    corpName: offer.corpName,
    price: offer.price,
    iskCost: offer.iskCost,
    lpCost: offer.lpCost,
    lpPriced: offer.lpPriced,
    regionId: null,
    locationName: null,
    space: null,
    systemId: null,
    stationName: null,
  };
}

export function communityOfferToSearchRow(
  offer: {
    uid: string;
    memberName: string;
    typeId: number;
    me: number;
    te: number;
    runs: number;
    quantity: number;
    communities: { id: string; name: string }[];
    stale: boolean;
    asOf: number | null;
    locationName: string;
    systemName: string;
  },
  system?: { id: number; name: string; security: number; regionId: number }
): BpcSearchRow {
  return {
    source: 'community',
    typeId: offer.typeId,
    me: offer.me,
    te: offer.te,
    runs: offer.runs,
    quantity: offer.quantity,
    price: 0,
    memberUid: offer.uid,
    memberName: offer.memberName,
    communities: offer.communities,
    stale: offer.stale,
    asOf: offer.asOf,
    locationName: offer.locationName,
    systemName: offer.systemName,
    regionId: system?.regionId ?? null,
    space: system ? classifySpace(system.name, system.security) : null,
    systemId: system?.id ?? null,
  };
}

export function contractRowToSearchRow(
  row: BpcContractRow,
  location?: { name: string | null; space: SpaceKind | null; systemId?: number | null }
): BpcSearchRow {
  return {
    source: 'contract',
    typeId: row.typeId,
    me: row.me,
    te: row.te,
    runs: row.runs,
    quantity: row.quantity,
    contract: row,
    locationName: location?.name ?? null,
    space: location?.space ?? null,
    systemId: location?.systemId ?? null,
  };
}

export function asContract(row: BpcSearchRow): BpcContractRow | null {
  return row.source === 'contract' ? row.contract : null;
}

export function ownedBlueprintToSearchRow(bp: OwnedBlueprintInput): BpcSearchRow {
  return {
    source: 'owned',
    typeId: bp.typeId,
    me: bp.me,
    te: bp.te,
    runs: bp.runs,
    quantity: bp.quantity > 0 ? bp.quantity : 1,
    itemId: bp.itemId,
    locationName: bp.locationName ?? null,
    regionId: bp.regionId ?? null,
    space: bp.space ?? null,
    systemId: bp.systemId ?? null,
  };
}

export function filterBpcSearchRows(
  rows: readonly BpcSearchRow[],
  filter: BpcSearchFilter
): BpcSearchRow[] {
  return rows.filter((row) => {
    if (filter.typeIds && !filter.typeIds.has(row.typeId)) return false;
    if (filter.minMe != null && row.me < filter.minMe) return false;
    if (filter.minTe != null && row.te < filter.minTe) return false;
    if (filter.minRuns != null && row.runs !== -1 && row.runs !== null && row.runs < filter.minRuns)
      return false;
    if (filter.regionId != null) {
      const regionId = row.source === 'contract' ? row.contract.regionId : row.regionId;
      if (regionId !== filter.regionId) return false;
    }
    if (filter.spaceKinds && (row.space == null || !filter.spaceKinds.has(row.space))) {
      return false;
    }
    if (
      filter.allowedSystems &&
      (row.systemId == null || !filter.allowedSystems.has(row.systemId))
    ) {
      return false;
    }
    if (row.source === 'contract' && filter.maxPrice != null) {
      const price = priceForMaxFilter(row.contract);
      if (price != null && price > filter.maxPrice) return false;
    }
    if (
      (row.source === 'market' || row.source === 'lp') &&
      filter.maxPrice != null &&
      row.price > filter.maxPrice
    ) {
      return false;
    }
    if (row.source === 'contract' && filter.hideAuctions && row.contract.isAuction) return false;
    if (row.source === 'contract' && filter.hidePlexRequests && row.contract.requestedPlex) {
      return false;
    }
    return true;
  });
}

export function filterBpcContracts(
  rows: readonly BpcContractRow[],
  filter: BpcSearchFilter
): BpcContractRow[] {
  return rows.filter((row) => {
    if (filter.typeIds && !filter.typeIds.has(row.typeId)) return false;
    if (filter.regionId != null && row.regionId !== filter.regionId) return false;
    if (filter.minMe != null && row.me < filter.minMe) return false;
    if (filter.minTe != null && row.te < filter.minTe) return false;
    if (filter.minRuns != null && row.runs !== -1 && row.runs < filter.minRuns) return false;
    if (filter.maxPrice != null) {
      const price = priceForMaxFilter(row);
      if (price != null && price > filter.maxPrice) return false;
    }
    if (filter.hideAuctions && row.isAuction) return false;
    if (filter.hidePlexRequests && row.requestedPlex) return false;
    return true;
  });
}

export function effectivePrice(row: BpcContractRow): number {
  if (!row.isAuction) return row.price;
  return row.buyout ?? row.price;
}

export function iskPerRun(
  price: number,
  runs: number,
  quantity: number,
  isMultiType = false
): number | null {
  if (isMultiType || !(price > 0) || !(runs > 0) || !(quantity > 0)) return null;
  return price / (runs * quantity);
}

export interface BlueprintTypeOption {
  typeId: number;
  name: string;
}

export interface BlueprintOfferStats {
  offerCount: number;
  bestMe: number;
  bestTe: number;
}

export function blueprintOfferStats(
  rows: readonly BpcContractRow[]
): Map<number, BlueprintOfferStats> {
  const stats = new Map<number, BlueprintOfferStats>();
  for (const row of rows) {
    const existing = stats.get(row.typeId);
    if (!existing) {
      stats.set(row.typeId, { offerCount: 1, bestMe: row.me, bestTe: row.te });
      continue;
    }
    existing.offerCount += 1;
    if (row.me > existing.bestMe) existing.bestMe = row.me;
    if (row.te > existing.bestTe) existing.bestTe = row.te;
  }
  return stats;
}

export interface BpcPriceSummary {
  offerCount: number;
  cheapest: number | null;
  cheapestPerRun: number | null;
  median: number | null;
  bestMe: number | null;
  bestTe: number | null;
}

export function bpcPriceSummary(rows: readonly BpcContractRow[]): BpcPriceSummary {
  if (rows.length === 0) {
    return {
      offerCount: 0,
      cheapest: null,
      cheapestPerRun: null,
      median: null,
      bestMe: null,
      bestTe: null,
    };
  }
  const prices = rows
    .map(effectivePrice)
    .filter((price) => price > 0)
    .sort((a, b) => a - b);
  const perRunRates = rows
    .map((row) => iskPerRun(effectivePrice(row), row.runs, row.quantity, row.isMultiType))
    .filter((rate): rate is number => rate !== null);
  return {
    offerCount: rows.length,
    cheapest: prices.length === 0 ? null : prices[0],
    cheapestPerRun:
      perRunRates.length === 0 ? null : perRunRates.reduce((best, rate) => Math.min(best, rate)),
    median: prices.length === 0 ? null : median(prices),
    bestMe: rows.reduce((best, row) => Math.max(best, row.me), rows[0].me),
    bestTe: rows.reduce((best, row) => Math.max(best, row.te), rows[0].te),
  };
}

export interface RegionCheapest {
  regionId: number;
  cheapest: number;
  offerCount: number;
}

export function cheapestByRegion(rows: readonly BpcContractRow[]): RegionCheapest[] {
  const byRegion = new Map<number, { offerCount: number; cheapest: number | null }>();
  for (const row of rows) {
    const price = effectivePrice(row);
    const unpriced = !(price > 0);
    const existing = byRegion.get(row.regionId);
    if (!existing) {
      byRegion.set(row.regionId, { offerCount: 1, cheapest: unpriced ? null : price });
      continue;
    }
    existing.offerCount += 1;
    if (!unpriced && (existing.cheapest === null || price < existing.cheapest)) {
      existing.cheapest = price;
    }
  }
  const priced = [...byRegion.entries()]
    .filter((entry): entry is [number, { offerCount: number; cheapest: number }] => {
      const [, value] = entry;
      return value.cheapest !== null;
    })
    .map(([regionId, { cheapest, offerCount }]) => ({ regionId, cheapest, offerCount }));
  return priced.sort((a, b) => a.cheapest - b.cheapest || a.regionId - b.regionId);
}

export function blueprintSearchName(name: string): string {
  const stripped = name.replace(/\s+blueprint\s*$/i, '').trim();
  return stripped.length > 0 ? stripped : name.trim();
}

export function listedBlueprintTypeOptions(
  rows: readonly { typeId: number }[],
  blueprintNames: ReadonlyMap<number, string>
): BlueprintTypeOption[] {
  const seen = new Map<number, string>();
  for (const row of rows) {
    if (seen.has(row.typeId)) continue;
    seen.set(row.typeId, blueprintNames.get(row.typeId) ?? `#${row.typeId}`);
  }
  return [...seen.entries()]
    .map(([typeId, name]) => ({ typeId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
