import type { LpRate } from '@/engine/loyalty/marketLpValue';
import {
  effectivePrice,
  filterBpcContracts,
  iskPerRun,
  type BpcContractRow,
} from '@/engine/contracts/bpcSearch';
import type { InventionQuote, InventionTier } from '@/engine/industry/invention';
import type { MaterialSourcing } from '@/engine/industry/types';
import type { RegionOrder } from '@/esi/endpoints';
import type { LpOfferMatch } from '@/features/market/appraisalLpAcquisition';

export interface ContractOfferRow {
  kind: 'contract';
  contractId: number;
  regionId: number;
  locationId: number;
  me: number;
  te: number;
  runs: number | null;
  quantity: number;
  price: number;
  isStartingBid: boolean;
  isMultiType: boolean;
  iskPerRun: number | null;
  pickable: boolean;
}

export interface ContractOfferRowsInput {
  copies: readonly BpcContractRow[];
  originals: readonly BpcContractRow[];
  blueprintTypeID: number;
  regionId: number | null;
}

interface SectionRow {
  pickable: boolean;
  price: number;
}

function sortRank(row: SectionRow): number {
  if (row.pickable) return 0;
  return row.price > 0 ? 1 : 2;
}

function byCheapest<T extends SectionRow>(rows: T[]): T[] {
  return rows.sort((a, b) => sortRank(a) - sortRank(b) || a.price - b.price);
}

export function cheapestRow<T extends SectionRow>(rows: readonly T[]): T | null {
  return rows.find((row) => row.pickable) ?? null;
}

export function contractOfferRows(input: ContractOfferRowsInput): ContractOfferRow[] {
  const filter = { typeIds: new Set([input.blueprintTypeID]), regionId: input.regionId };
  const listed = [
    ...filterBpcContracts(input.copies, filter),
    ...filterBpcContracts(input.originals, filter),
  ];
  return byCheapest(
    listed.map((row): ContractOfferRow => {
      const price = effectivePrice(row);
      const isOriginal = row.runs === -1;
      return {
        kind: 'contract',
        contractId: row.contractId,
        regionId: row.regionId,
        locationId: row.locationId,
        me: row.me,
        te: row.te,
        runs: isOriginal ? null : row.runs,
        quantity: row.quantity,
        price,
        isStartingBid: row.isAuction && row.buyout === undefined,
        isMultiType: row.isMultiType,
        iskPerRun: isOriginal ? null : iskPerRun(price, row.runs, row.quantity, row.isMultiType),
        pickable: !row.isMultiType && price > 0,
      };
    })
  );
}

export interface MarketSellRow {
  kind: 'market';
  orderId: number;
  locationId: number;
  price: number;
  volumeRemain: number;
  atHub: boolean;
  me: 0;
  te: 0;
  pickable: true;
}

export function marketSellRows(
  orders: readonly RegionOrder[],
  hubStationId: number
): MarketSellRow[] {
  return byCheapest(
    orders
      .filter((o) => !o.is_buy_order)
      .map((o): MarketSellRow => ({
        kind: 'market',
        orderId: o.order_id,
        locationId: o.location_id,
        price: o.price,
        volumeRemain: o.volume_remain,
        atHub: o.location_id === hubStationId,
        me: 0,
        te: 0,
        pickable: true,
      }))
  );
}

export interface OfferGroup<T> {
  row: T;
  count: number;
}

function groupBy<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  merge: (into: T, next: T) => T = (into) => into
): OfferGroup<T>[] {
  const groups = new Map<string, OfferGroup<T>>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) {
      group.row = merge(group.row, row);
      group.count += 1;
    } else groups.set(key, { row, count: 1 });
  }
  return [...groups.values()];
}

export function groupContractOffers(
  rows: readonly ContractOfferRow[]
): OfferGroup<ContractOfferRow>[] {
  return groupBy(rows, (r) =>
    [
      r.runs ?? 'bpo',
      r.me,
      r.te,
      r.price,
      r.regionId,
      r.locationId,
      r.quantity,
      r.isStartingBid,
      r.isMultiType,
    ].join(':')
  );
}

export function groupMarketSells(rows: readonly MarketSellRow[]): OfferGroup<MarketSellRow>[] {
  return groupBy(
    rows,
    (r) => `${r.price}:${r.locationId}`,
    (into, next) => ({ ...into, volumeRemain: into.volumeRemain + next.volumeRemain })
  );
}

export const SECTION_ROW_LIMIT = 10;

export function sectionRows<T>(
  rows: readonly T[],
  isPickable: (row: T) => boolean,
  limit: number = SECTION_ROW_LIMIT
): { shown: T[]; total: number } {
  const pickable = rows.filter(isPickable);
  const listed = pickable.length > 0 ? pickable : [...rows];
  return { shown: listed.slice(0, limit), total: listed.length };
}

export function lpPickPrice(iskCost: number, lpCost: number, iskPerLp: number | null): number {
  return iskCost + lpCost * (validRate(iskPerLp) ?? 0);
}

function validRate(iskPerLp: number | null): number | null {
  return iskPerLp !== null && Number.isFinite(iskPerLp) && iskPerLp >= 0 ? iskPerLp : null;
}

export interface LpOfferRow {
  kind: 'lp';
  corporationId: number;
  offerId: number;
  corpName: string;
  iskCost: number;
  lpCost: number;
  quantity: number;
  requiredItemCount: number;
  turnInCost: number | null;
  price: number;
  lpPriced: boolean;
  lpRate: number | null;
  lpRateSource: LpRate['source'];
  me: 0;
  te: 0;
  pickable: boolean;
}

export function lpOfferRows(
  matches: readonly LpOfferMatch[],
  lpRate: LpRate,
  turnInCostFor: (offer: LpOfferMatch['offer']) => number | null = () => 0
): LpOfferRow[] {
  return byCheapest(
    matches.map((m): LpOfferRow => {
      const { rate, source } = lpRate;
      const turnInCost = m.offer.required_items.length === 0 ? 0 : turnInCostFor(m.offer);
      return {
        kind: 'lp',
        corporationId: m.corporationId,
        offerId: m.offer.offer_id,
        corpName: m.corpName,
        iskCost: m.offer.isk_cost,
        lpCost: m.offer.lp_cost,
        quantity: m.offer.quantity,
        requiredItemCount: m.offer.required_items.length,
        turnInCost,
        price: Math.round(lpPickPrice(m.offer.isk_cost, m.offer.lp_cost, rate) + (turnInCost ?? 0)),
        lpPriced: validRate(rate) !== null && m.offer.lp_cost > 0,
        lpRate: rate,
        lpRateSource: source,
        me: 0,
        te: 0,
        pickable: m.offer.lp_cost === 0 || validRate(rate) !== null,
      };
    })
  );
}

export interface AcquisitionOwnedCopy {
  me: number;
  te: number;
  runs: number;
}

export interface OwnedTierRow {
  kind: 'owned';
  me: number;
  te: number;
  runs: number | null;
}

export function ownedTierRows(copies: readonly AcquisitionOwnedCopy[]): OwnedTierRow[] {
  const byTier = new Map<string, OwnedTierRow>();
  for (const copy of copies) {
    const key = `${copy.me}:${copy.te}`;
    const existing = byTier.get(key);
    if (!existing) {
      byTier.set(key, {
        kind: 'owned',
        me: copy.me,
        te: copy.te,
        runs: copy.runs === -1 ? null : copy.runs,
      });
      continue;
    }
    if (existing.runs !== null && copy.runs !== -1) existing.runs += copy.runs;
    else existing.runs = null;
  }
  return [...byTier.values()].sort((a, b) => b.me - a.me || b.te - a.te);
}

export type InventTierRow = InventionTier & { kind: 'invent'; price: number; pickable: boolean };

export function inventTierRows(quote: InventionQuote): InventTierRow[] {
  const [none, ...decrypted] = quote.tiers.map((tier): InventTierRow => ({
    ...tier,
    kind: 'invent',
    price: tier.expectedCostPerCopy ?? 0,
    pickable: tier.expectedCostPerCopy !== null,
  }));
  return [
    ...(none ? [none] : []),
    ...decrypted.sort((a, b) => a.decryptor!.name.localeCompare(b.decryptor!.name)),
  ];
}

export function cheapestInventRow(rows: readonly InventTierRow[]): InventTierRow | null {
  let best: InventTierRow | null = null;
  for (const row of rows) {
    if (row.expectedCostPerRun === null) continue;
    if (best === null || row.expectedCostPerRun < best.expectedCostPerRun!) best = row;
  }
  return best;
}

export type AcquisitionSourceRow =
  OwnedTierRow | ContractOfferRow | MarketSellRow | LpOfferRow | InventTierRow;

export function overridePatchFor(row: AcquisitionSourceRow): MaterialSourcing {
  if (row.kind === 'invent') {
    return {
      acquisitionTierOverride: { me: row.me, te: row.te, invented: { runs: row.runs } },
      overridePrice: undefined,
    };
  }
  return {
    acquisitionTierOverride: { me: row.me, te: row.te },
    overridePrice: row.kind === 'owned' ? undefined : row.price,
  };
}

export function runsForPickedRow(row: AcquisitionSourceRow): number | null {
  switch (row.kind) {
    case 'owned':
      return row.runs ?? 1;
    case 'contract':
      return row.runs === null ? 1 : row.runs * row.quantity;
    case 'market':
      return 1;
    case 'lp':
      return null;
    case 'invent':
      return row.runs;
  }
}

export function isCurrentPick(
  row: AcquisitionSourceRow,
  sourcing: MaterialSourcing | undefined
): boolean {
  const override = sourcing?.acquisitionTierOverride;
  if (!override || override.me !== row.me || override.te !== row.te) return false;
  if (row.kind === 'invent') return override.invented?.runs === row.runs;
  return !override.invented && sourcing.overridePrice === overridePatchFor(row).overridePrice;
}
