/**
 * Whether a blueprint original is also for sale beside the copies BPC
 * Sourcing lists, and whether it may be the cheaper buy (issue #1241). Pure:
 * the panel fetches Order Book views and the contract snapshot, this shapes
 * them.
 *
 * Built on Blueprint Acquisition's own row builders (issue #1240) so both
 * surfaces agree on what "cheapest BPO" means: `contractOfferRows` skips
 * multi-type bundles and zero-price barters via `cheapestRow`, and
 * `marketSellRows` reads sell orders only.
 */
import {
  effectivePrice,
  type BpcContractRow,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import type { RegionOrder } from '@/esi/endpoints';
import {
  cheapestRow,
  contractOfferRows,
  marketSellRows,
  type ContractOfferRow,
  type MarketSellRow,
} from '@/features/industry/blueprintAcquisitionSources';

/** One market BPO sell order, with the region it was read from. */
export type MarketBpoOffer = MarketSellRow & { regionId: number };

/** One type's loaded Order Book view, as far as BPO availability reads it. */
export interface MarketBpoBook {
  /** Where the book was read from — a Global Market Region's when one won. */
  regionId: number;
  /** Sell orders only; order is not relied on. */
  sell: readonly RegionOrder[];
}

/** The cheapest original of one blueprint: a public contract, or a market sell order. */
export type BpoOffer = ContractOfferRow | MarketBpoOffer;

export interface BpoAvailabilityInput {
  /** Contract originals, `runs: -1` (`PublicBpcContractsSnapshot.originals`). */
  originals: readonly BpcContractRow[];
  /** `null` = every region. */
  contractRegionId: number | null;
  /** Loaded books per checked type. A type absent here was not looked up, or failed — no market answer, not "none". */
  marketBooks: ReadonlyMap<number, MarketBpoBook>;
  /** Marks orders at the region's Trade Hub station. */
  hubStationId: number;
}

/** One region's BPO sell orders, cheapest first. */
export function marketBpoOffers(
  orders: readonly RegionOrder[],
  regionId: number,
  hubStationId: number
): MarketBpoOffer[] {
  return marketSellRows(orders, hubStationId).map((row) => ({ ...row, regionId }));
}

/** One type's cheapest original from each source; at least one is non-null. */
export interface BpoSources {
  market: MarketBpoOffer | null;
  contract: ContractOfferRow | null;
}

/**
 * The cheapest pickable original per type in `typeIds`, kept per source:
 * contracts in `contractRegionId`, market orders in each type's own book.
 * Types with no BPO at all are left out.
 */
export function cheapestBpoSourcesByType(
  typeIds: Iterable<number>,
  input: BpoAvailabilityInput
): Map<number, BpoSources> {
  const wanted = new Set(typeIds);
  const originalsByType = new Map<number, BpcContractRow[]>();
  for (const row of input.originals) {
    if (!wanted.has(row.typeId)) continue;
    const list = originalsByType.get(row.typeId);
    if (list) list.push(row);
    else originalsByType.set(row.typeId, [row]);
  }

  const result = new Map<number, BpoSources>();
  for (const typeId of wanted) {
    const originals = originalsByType.get(typeId);
    const contract = originals
      ? cheapestRow(
          contractOfferRows({
            copies: [],
            originals,
            blueprintTypeID: typeId,
            regionId: input.contractRegionId,
          })
        )
      : null;
    const book = input.marketBooks.get(typeId);
    const market = book
      ? cheapestRow(marketBpoOffers(book.sell, book.regionId, input.hubStationId))
      : null;
    if (market || contract) result.set(typeId, { market, contract });
  }
  return result;
}

/** The cheaper of a type's two sources; a tie goes to the contract (it may be researched, a market original never is). */
export function cheaperBpo({ market, contract }: BpoSources): BpoOffer | null {
  return market && (!contract || market.price < contract.price) ? market : contract;
}

/**
 * The cheapest pickable original per type in `typeIds`, from contracts in
 * `contractRegionId` and market orders in each type's own book. A tie goes to
 * the contract: it may be researched, a market original never is. Types with
 * no BPO at all are left out.
 */
export function cheapestBpoByType(
  typeIds: Iterable<number>,
  input: BpoAvailabilityInput
): Map<number, BpoOffer> {
  const result = new Map<number, BpoOffer>();
  for (const [typeId, sources] of cheapestBpoSourcesByType(typeIds, input)) {
    const best = cheaperBpo(sources);
    if (best) result.set(typeId, best);
  }
  return result;
}

/**
 * The cheapest copy a BPO price can honestly be compared with: not a
 * multi-type bundle, not a zero-price barter. `null` when none qualifies.
 */
export function cheapestComparableCopy(rows: readonly BpcContractRow[]): BpcContractRow | null {
  let best: BpcContractRow | null = null;
  for (const row of rows) {
    if (row.isMultiType || !(effectivePrice(row) > 0)) continue;
    if (!best || effectivePrice(row) < effectivePrice(best)) best = row;
  }
  return best;
}

/**
 * The one copy row per type that carries the "BPO too" badge when results
 * span several blueprints — once per type, never on every offer. Its cheapest
 * comparable contract copy, so "may be cheaper" is judged where it means
 * most; else its first copy row. Originals are never badged: they are the BPO.
 */
export function bpoBadgeRows(rows: readonly BpcSearchRow[]): Set<BpcSearchRow> {
  const byType = new Map<number, BpcSearchRow>();
  const price = (row: BpcSearchRow) =>
    row.source === 'contract' && !row.contract.isMultiType ? effectivePrice(row.contract) : 0;
  for (const row of rows) {
    if (row.runs === -1) continue;
    const current = byType.get(row.typeId);
    if (!current) {
      byType.set(row.typeId, row);
      continue;
    }
    const candidate = price(row);
    if (candidate > 0 && (!(price(current) > 0) || candidate < price(current))) {
      byType.set(row.typeId, row);
    }
  }
  return new Set(byType.values());
}

/**
 * Whether the BPO's full price is at or below what this copy offer asks —
 * facts only, no amortisation over runs. False whenever either side has no
 * honest price: no BPO, a zero-price barter, or a multi-type bundle (its ask
 * is the whole contract's, not this blueprint's). A no-buyout auction is
 * judged on its starting bid: the eventual price can only be higher, so
 * "BPO ≤ starting bid" still holds once it sells.
 */
export function bpoMayBeCheaper(
  bpo: { price: number } | null | undefined,
  offer: BpcContractRow
): boolean {
  if (!bpo || !(bpo.price > 0) || offer.isMultiType) return false;
  const offerPrice = effectivePrice(offer);
  return offerPrice > 0 && bpo.price <= offerPrice;
}

/**
 * Which box in the Cheapest by region / Market BPOs / Contract BPOs row gets
 * the "cheapest" accent — at most one, and only when the row holds more than
 * one box. `regionCheapest` is the leading region cell's price, or `null`
 * when no region cells show. A BPO takes the accent only when strictly
 * cheaper than every other box; a tie leaves it on the region cell.
 */
export function cheapestSourcingCard(
  regionCheapest: number | null,
  bpos: readonly Pick<BpoOffer, 'kind' | 'price'>[]
): 'region' | BpoOffer['kind'] | null {
  const boxes = (regionCheapest === null ? 0 : 1) + bpos.length;
  if (boxes < 2) return null;
  let winner: 'region' | BpoOffer['kind'] | null = regionCheapest === null ? null : 'region';
  let best = regionCheapest ?? Infinity;
  for (const bpo of bpos) {
    if (bpo.price < best) {
      best = bpo.price;
      winner = bpo.kind;
    }
  }
  return winner;
}
