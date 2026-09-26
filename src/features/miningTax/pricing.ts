/**
 * Trade-hub price lookups for the Moon Mining Tax ledger (issue #523), via
 * Fuzzwork for today's live book (ADR 0002), the server's own hub-price
 * snapshot for a saved or historical day, and the app's per-browser Dexie
 * snapshot as a further Jita-only fallback (`priceBasis.ts`'s
 * `resolveTaxUnitPrice` — issue #1279 follow-up, "Mining Tax: price at the
 * entry's mined date, not today's live price").
 *
 * Jita is the default and remains the basis for any Payee that names no hub of
 * its own; a Payee may name another (`PayeeRecord.hubId`) when that is the
 * book the landlord actually bills against.
 *
 * Priced at the **buy** order for the day the ore was mined, of the ore's
 * **Compressed** counterpart when the SDE has one (`loadCompressedOreTypeIds`)
 * — a corp valuing what got mined values it the way it would actually turn
 * that ore into ISK: sell into buy orders, and compressed ore is generally
 * the more liquid, more commonly traded form even though the personal mining
 * ledger only ever reports the raw type. This is a deliberate divergence from
 * Industry's own "lowest sell" convention for material cost
 * (`docs/context/decisions/20260906-081307-moon-mining-price-compressed-ore-at-jita-buy.md`),
 * not a shared meaning of "Jita price" across the app. That decision doc only
 * covers buy-vs-sell and compressed-vs-raw; which *day's* price to use is a
 * separate decision, recorded in this fix's own decision doc.
 */
import { getHubPrices } from '@/market/prices';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { loadCompressedOreTypeIds } from '@/sde/loadSde';
import { loadHubSnapshotRange } from '@/features/market/hubSnapshot';
import { loadPriceSnapshots } from './priceSnapshots';
import {
  mergeSnapshotDay,
  resolveTaxUnitPrice,
  type SidePrices,
  type SnapshotDay,
} from '@/engine/miningTax/priceBasis';

export interface UnitPrices {
  /** Per-unit buy price by raw typeId. 0 for anything not priceable that day. */
  prices: Map<number, number>;
  /**
   * Raw typeIds with no buy price that day.
   *
   * Reported separately rather than folded into `prices` as a `null`, which
   * would ripple `number | null` through `engine/miningTax/valuation.ts` and
   * every dialog that values a line. The 0 is what keeps the arithmetic
   * working; this set is what stops a pilot reading it as "this ore is worth
   * nothing" — a tax bill of 0 ISK that renders like any other is the failure
   * mode a thin order book would otherwise cause silently.
   */
  unpriced: Set<number>;
}

/** The hub a Payee's `hubId` names, or Jita when it names none (or one this build does not know). */
export function hubForPayee(hubId: string | undefined): TradeHub {
  return TRADE_HUBS.find((hub) => hub.id === hubId) ?? DEFAULT_TRADE_HUB;
}

/** One hub's resolved buy price for every requested type, on every requested date. */
interface DatedHubResult {
  /** date -> {prices, unpriced}, per raw typeId. */
  byDate: Map<string, UnitPrices>;
}

function toSidePricesMap(day: SnapshotDay): Map<number, SidePrices> {
  return new Map(Object.entries(day).map(([typeId, prices]) => [Number(typeId), prices]));
}

/**
 * Resolves `typeIds`' buy price at `hub` on every date in `dates`, via
 * `resolveTaxUnitPrice`'s saved → historical → live chain. The one place that
 * actually fetches: `loadDatedUnitPricesByHub` and `loadUnitPricesOnDate`
 * both call this, for a whole ledger's dates or a single Assignment's date
 * respectively.
 */
async function resolvePricesForHubAcrossDates(
  characterId: number,
  typeIds: readonly number[],
  hub: TradeHub,
  dates: readonly string[]
): Promise<DatedHubResult> {
  const unique = [...new Set(typeIds)];
  const byDate = new Map<string, UnitPrices>();
  if (unique.length === 0 || dates.length === 0) return { byDate };

  const compressedByRaw = await loadCompressedOreTypeIds();
  const pricedTypeId = (typeId: number): number => compressedByRaw[String(typeId)] ?? typeId;
  const pricingTypeIds = [...new Set(unique.map(pricedTypeId))];

  const sortedDates = [...dates].sort();
  const start = sortedDates[0];
  const end = sortedDates[sortedDates.length - 1];

  const [{ saved: serverSaved, historical }, liveAggregates, dexieSaved] = await Promise.all([
    loadHubSnapshotRange(characterId, start, end, hub),
    getHubPrices(hub, pricingTypeIds),
    // Dexie only ever holds Jita — no equivalent for the other 4 hubs.
    hub.id === DEFAULT_TRADE_HUB.id
      ? loadPriceSnapshots().catch(() => new Map<string, SnapshotDay>())
      : Promise.resolve(new Map<string, SnapshotDay>()),
  ]);

  for (const date of sortedDates) {
    // Server wins over the per-browser Dexie snapshot for the same day/type —
    // the server captures 4x/day regardless of who's online, Dexie only when
    // this browser happened to load the page that day.
    const serverDay = serverSaved.get(date);
    const dexieDay = dexieSaved.get(date);
    const mergedSaved =
      dexieDay || serverDay
        ? toSidePricesMap(
            mergeSnapshotDay(dexieDay ?? {}, serverDay ? Object.fromEntries(serverDay) : {})
          )
        : undefined;
    const historicalForDate = historical.get(date);

    const prices = new Map<number, number>();
    const unpriced = new Set<number>();
    for (const typeId of unique) {
      const pid = pricedTypeId(typeId);
      const resolved = resolveTaxUnitPrice({
        saved: mergedSaved?.get(pid),
        historical: historicalForDate?.get(pid),
        live: { buy: liveAggregates.get(pid)?.buyMax ?? null, sell: null },
      });
      const price = resolved.price ?? 0;
      prices.set(typeId, price);
      // A quoted zero counts as unpriced: an order book that bids nothing
      // values the ore no better than one with no orders at all, and the
      // pilot needs to know before sending the bill either way.
      if (price <= 0) unpriced.add(typeId);
    }
    byDate.set(date, { prices, unpriced });
  }
  return { byDate };
}

/**
 * Per-unit buy price for `typeIds` at `hub` on one specific date — the shape
 * `resolveNeedsReview` needs to re-price a single Assignment at its own
 * mined date, without the whole ledger's bulk fetch `loadDatedUnitPricesByHub`
 * does for `TaxTab`.
 */
export async function loadUnitPricesOnDate(
  characterId: number,
  typeIds: readonly number[],
  hub: TradeHub,
  date: string
): Promise<UnitPrices> {
  const { byDate } = await resolvePricesForHubAcrossDates(characterId, typeIds, hub, [date]);
  return byDate.get(date) ?? { prices: new Map(), unpriced: new Set() };
}

/** One ledger's prices, at every hub its Payees actually bill against, on every date the ledger needs. */
export interface DatedUnitPrices {
  /** Per-unit buy price by raw typeId, per hub id, per date. */
  byHubAndDate: ReadonlyMap<TradeHub['id'], ReadonlyMap<string, ReadonlyMap<number, number>>>;
  /**
   * Per hub, the raw typeIds that hub had no buy price for on *any* date they
   * appeared — a union across dates, same "one order book, one banner line"
   * reasoning `loadUnitPricesByHub` used before this. Coarser than per-date,
   * but the banner is a heads-up, not a computation: `byHubAndDate` is what
   * actually feeds each row's value.
   */
  unpricedByHub: ReadonlyMap<TradeHub['id'], ReadonlySet<number>>;
  /** The union of `unpricedByHub` — "is there anything at all to warn about". */
  unpriced: Set<number>;
}

const NO_PRICES: ReadonlyMap<number, number> = new Map();

/**
 * Prices at the hub `hubId` names on `date`, falling back to the default
 * hub's map (and then to an empty one) when that hub or date was never
 * loaded — an unknown or newly-typed hub id values ore at Jita rather than at
 * nothing, matching `hubForPayee`.
 */
export function pricesAtHubOnDate(
  data: DatedUnitPrices,
  hubId: string | undefined,
  date: string
): ReadonlyMap<number, number> {
  const hub = hubForPayee(hubId);
  return (
    data.byHubAndDate.get(hub.id)?.get(date) ??
    data.byHubAndDate.get(DEFAULT_TRADE_HUB.id)?.get(date) ??
    NO_PRICES
  );
}

/**
 * Prices `typeIds` at each distinct hub in `hubIds` — the ledger's Payees'
 * hubs — plus the default, which is always loaded: the ledger values its
 * *unassigned* ore at Jita (no Payee, no hub) whether or not any Payee names
 * one. Every hub is priced for the whole type list and every date in `dates`
 * rather than only what its own Payees have actually mined: an unassigned
 * entry can be assigned to any Payee, and the Assign dialog re-prices live as
 * the pilot changes that selection, so a per-hub narrowing would leave the
 * preview blank for exactly the choice the pilot is making. One
 * `getHubPrices`/`loadHubSnapshotRange` pair per distinct hub — an all-Jita
 * ledger (the common case) still makes exactly one of each.
 */
export async function loadDatedUnitPricesByHub(
  characterId: number,
  typeIds: readonly number[],
  hubIds: Iterable<string | undefined>,
  dates: readonly string[]
): Promise<DatedUnitPrices> {
  const hubs = new Map<TradeHub['id'], TradeHub>([[DEFAULT_TRADE_HUB.id, DEFAULT_TRADE_HUB]]);
  for (const hubId of hubIds) {
    const hub = hubForPayee(hubId);
    hubs.set(hub.id, hub);
  }

  const loaded = await Promise.all(
    [...hubs.values()].map(
      async (hub) =>
        [hub.id, await resolvePricesForHubAcrossDates(characterId, typeIds, hub, dates)] as const
    )
  );

  const byHubAndDate = new Map<TradeHub['id'], ReadonlyMap<string, ReadonlyMap<number, number>>>();
  const unpricedByHub = new Map<TradeHub['id'], ReadonlySet<number>>();
  const unpriced = new Set<number>();
  for (const [hubId, result] of loaded) {
    const byDate = new Map<string, ReadonlyMap<number, number>>();
    const hubUnpriced = new Set<number>();
    for (const [date, dayResult] of result.byDate) {
      byDate.set(date, dayResult.prices);
      for (const typeId of dayResult.unpriced) {
        hubUnpriced.add(typeId);
        unpriced.add(typeId);
      }
    }
    byHubAndDate.set(hubId, byDate);
    unpricedByHub.set(hubId, hubUnpriced);
  }
  return { byHubAndDate, unpricedByHub, unpriced };
}
