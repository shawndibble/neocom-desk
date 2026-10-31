/**
 * Loads corporations' market **LP Value** at a Trade Hub — each store priced
 * exactly as the LP Store page prices it (`computeLoyaltyOfferRows`, selling
 * at the hub's sell price), then read by `marketLpValue`. Priced for no
 * particular pilot: untrained trade skills and no standing, so the fees are
 * the full ones and the rate errs low rather than flattering the LP.
 *
 * Remembered per corporation and hub for a while; a failed load is not
 * remembered, so the next ask tries again. The offers and prices underneath
 * are cached on their own terms.
 */
import { marketLpValue } from '@/engine/loyalty/marketLpValue';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { HAULING_THRESHOLDS } from '@/engine/market/haulingMarket';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { loadMarketSnapshots, type MarketSnapshot } from '@/features/industry/marketData';
import type { TradeHub } from '@/market/hubs';
import { loadHaulingDemand, type HaulingDemand } from '@/features/market/haulingDemand';
import { computeLoyaltyOfferRows, offerPriceTypeIds } from './offerRows';
import { loadLoyaltyStoreOffers } from './store';

const REMEMBER_MS = 15 * 60 * 1000;

const remembered = new Map<string, { at: number; value: Promise<number | null> }>();

function valueOf(
  offers: readonly LoyaltyStoreOffer[],
  catalog: BlueprintCatalog,
  snapshot: MarketSnapshot,
  demand: HaulingDemand | null
): number | null {
  const rows = computeLoyaltyOfferRows({
    offers,
    catalog,
    hubPrices: snapshot.hubPrices,
    adjustedPrices: snapshot.adjustedPrices,
    systemCostIndex: snapshot.systemCostIndex,
    skills: {},
    materialSourcing: undefined,
    liquidationBasis: 'order',
    playerLp: 0,
    tradedPrices: demand?.types,
  });
  return marketLpValue(
    rows.map((row) => {
      // A blueprint offer sells its product: one run's worth, as the row prices it.
      const product = catalog.byBlueprintTypeID.get(row.offer.type_id)?.blueprint.products[0];
      const sold = product ? product.typeID : row.offer.type_id;
      return {
        iskPerLp: row.profit.iskPerLp,
        sellVolume: snapshot.hubSellVolumes[sold] ?? 0,
        quantity: product ? product.quantity : row.offer.quantity,
        // A type absent from a loaded demand object never traded in the window.
        soldPerDay: demand
          ? (demand.types.get(sold)?.volume ?? 0) / HAULING_THRESHOLDS.historyDays
          : null,
      };
    })
  );
}

/** Offers by corporation the caller already holds (the LP Store landing's snapshot). */
export type HeldLpOffers = ReadonlyMap<number, readonly LoyaltyStoreOffer[]>;

interface PricedStores {
  values: Map<number, number | null>;
  /** False when recent trades were unavailable: the values are unchecked, so they are not remembered. */
  checked: boolean;
}

/** Prices every store in one market fetch, so materials they share are fetched once. */
async function computeMany(
  corporationIds: number[],
  hub: TradeHub,
  held: HeldLpOffers | undefined
): Promise<PricedStores> {
  const [catalog, demand, offersByCorp] = await Promise.all([
    loadBlueprintCatalog(),
    loadHaulingDemand(hub.regionId),
    Promise.all(
      corporationIds.map(
        async (id) => held?.get(id) ?? (await loadLoyaltyStoreOffers(id))?.data ?? []
      )
    ),
  ]);
  const priced = corporationIds
    .map((id, i) => ({ id, offers: offersByCorp[i]! }))
    .filter((store) => store.offers.length > 0);
  const snapshots = loadMarketSnapshots(
    priced.map((store) => ({ hub, typeIds: offerPriceTypeIds(store.offers, catalog) }))
  );
  const values = new Map<number, number | null>(corporationIds.map((id) => [id, null]));
  await Promise.all(
    priced.map(async (store, i) => {
      values.set(store.id, valueOf(store.offers, catalog, await snapshots[i]!, demand));
    })
  );
  return { values, checked: demand !== null };
}

/**
 * ISK per LP the market pays for each of `corporationIds`' LP at `hub`; null
 * for a store that gives too little to go on. `held` supplies offers the
 * caller already has, so pricing every store does not ask ESI for each one.
 */
export async function loadMarketLpValues(
  corporationIds: Iterable<number>,
  hub: TradeHub,
  { now = Date.now, held }: { now?: () => number; held?: HeldLpOffers } = {}
): Promise<Map<number, number | null>> {
  const ids = [...new Set(corporationIds)];
  const keyOf = (id: number) => `${id}|${hub.id}`;
  const stale = ids.filter((id) => {
    const hit = remembered.get(keyOf(id));
    return !hit || now() - hit.at >= REMEMBER_MS;
  });
  if (stale.length > 0) {
    const batch = computeMany(stale, hub, held);
    for (const id of stale) {
      const value = batch.then(({ values }) => values.get(id) ?? null);
      remembered.set(keyOf(id), { at: now(), value });
      // A failure, or a value priced without recent trades, is answered now and asked again next time.
      const forget = () => {
        if (remembered.get(keyOf(id))?.value === value) remembered.delete(keyOf(id));
      };
      batch.then((priced) => {
        if (!priced.checked) forget();
      }, forget);
    }
  }
  const values = await Promise.all(
    ids.map((id) => remembered.get(keyOf(id))!.value.catch(() => null))
  );
  return new Map(ids.map((id, i) => [id, values[i]!]));
}

/** One corporation's market LP Value at `hub` (`loadMarketLpValues`). */
export async function loadMarketLpValue(
  corporationId: number,
  hub: TradeHub,
  now: () => number = Date.now
): Promise<number | null> {
  return (await loadMarketLpValues([corporationId], hub, { now })).get(corporationId) ?? null;
}
