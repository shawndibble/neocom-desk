import { marketLpValue } from '@/engine/loyalty/marketLpValue';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { HAULING_THRESHOLDS } from '@/engine/market/haulingMarket';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { loadMarketSnapshots, type MarketSnapshot } from '@/features/industry/marketData';
import type { TradeHub } from '@/market/hubs';
import { loadHaulingDemand, type HaulingDemand } from '@/features/market/haulingDemand';
import { computeLoyaltyOfferRows, offerPriceTypeIds } from './offerRows';
import { revenuePricing, type PriceBasis } from './priceBasis';
import { loadLoyaltyStoreOffers } from './store';

const REMEMBER_MS = 15 * 60 * 1000;

const remembered = new Map<string, { at: number; value: Promise<number | null> }>();

function valueOf(
  offers: readonly LoyaltyStoreOffer[],
  catalog: BlueprintCatalog,
  snapshot: MarketSnapshot,
  demand: HaulingDemand | null,
  basis: PriceBasis
): number | null {
  const rows = computeLoyaltyOfferRows({
    offers,
    catalog,
    hubPrices: snapshot.hubPrices,
    adjustedPrices: snapshot.adjustedPrices,
    systemCostIndex: snapshot.systemCostIndex,
    regionalTaxPct: snapshot.regionalTaxPct,
    skills: {},
    materialSourcing: undefined,
    ...revenuePricing(snapshot, basis),
    playerLp: 0,
    tradedPrices: demand?.types,
  });
  return marketLpValue(
    rows.map((row) => {
      const product = catalog.byBlueprintTypeID.get(row.offer.type_id)?.blueprint.products[0];
      const sold = product ? product.typeID : row.offer.type_id;
      return {
        iskPerLp: row.profit.iskPerLp,
        sellVolume: snapshot.hubSellVolumes[sold] ?? 0,
        quantity: product ? product.quantity : row.offer.quantity,
        soldPerDay: demand
          ? (demand.types.get(sold)?.volume ?? 0) / HAULING_THRESHOLDS.historyDays
          : null,
      };
    })
  );
}

export type HeldLpOffers = ReadonlyMap<number, readonly LoyaltyStoreOffer[]>;

interface PricedStores {
  values: Map<number, number | null>;
  checked: boolean;
}

async function computeMany(
  corporationIds: number[],
  hub: TradeHub,
  held: HeldLpOffers | undefined,
  basis: PriceBasis
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
      values.set(store.id, valueOf(store.offers, catalog, await snapshots[i]!, demand, basis));
    })
  );
  return { values, checked: demand !== null };
}

export async function loadMarketLpValues(
  corporationIds: Iterable<number>,
  hub: TradeHub,
  {
    now = Date.now,
    held,
    basis = 'sell',
  }: { now?: () => number; held?: HeldLpOffers; basis?: PriceBasis } = {}
): Promise<Map<number, number | null>> {
  const ids = [...new Set(corporationIds)];
  const keyOf = (id: number) => `${id}|${hub.id}|${basis}`;
  const stale = ids.filter((id) => {
    const hit = remembered.get(keyOf(id));
    return !hit || now() - hit.at >= REMEMBER_MS;
  });
  if (stale.length > 0) {
    const batch = computeMany(stale, hub, held, basis);
    for (const id of stale) {
      const value = batch.then(({ values }) => values.get(id) ?? null);
      remembered.set(keyOf(id), { at: now(), value });
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

export async function loadMarketLpValue(
  corporationId: number,
  hub: TradeHub,
  options: { now?: () => number; basis?: PriceBasis } = {}
): Promise<number | null> {
  return (await loadMarketLpValues([corporationId], hub, options)).get(corporationId) ?? null;
}
