/**
 * Composes one corp's LP store into ranked, profit-annotated rows: the
 * offers list, the Build Plan blueprint catalog (to tell a blueprint offer
 * from a plain item), a market snapshot at the selected hub (reusing
 * `src/features/industry/marketData.ts`, the same loader a Build Plan
 * uses), the active character's trained skills and LP balance with this
 * corp, and their detected owned-material stock
 * (`useDetectedOwnedStock`, the same hook a Build Plan's materials table
 * uses) for the per-offer "use my own materials" toggle.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useMarketHub } from '@/features/market/hub';
import { getTradeHub, DEFAULT_TRADE_HUB, type TradeHub } from '@/market/hubs';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { loadLoyaltyStoreOffersStatus, loadCorporationName } from './store';
import {
  EMPTY_BLUEPRINT_CATALOG,
  loadBlueprintCatalog,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { useMarketSnapshot } from '@/features/industry/useMarketSnapshot';
import { loadCorrectedSkills, skillLevelsOf } from '@/features/skills/correctedSkills';
import { loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { loadTypeNames } from '@/features/character/typeNames';
import { revenuePricing, usePriceBasis } from './priceBasis';
import { useLpStoreVolume } from './lpStoreVolume';
import { useHaulingDemand } from '@/features/market/haulingDemand';
import {
  useDetectedOwnedStock,
  useOwnedStockSnapshot,
} from '@/features/industry/useDetectedOwnedStock';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { MaterialSourcingMap, SkillLevels } from '@/engine/industry/types';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import {
  collectNameableTypeIds,
  computeLoyaltyOfferRows,
  offerPriceTypeIds,
  type LoyaltyOfferRow,
} from './offerRows';

export interface LoyaltyStoreResult {
  corpName: string | null;
  offersFetchedAt: Date | null;
  offersFromCache: boolean;
  /** ESI did not answer and nothing was cached — not the same as an empty store. */
  offersError: boolean;
  reloadOffers: () => void;
  rows: LoyaltyOfferRow[];
  /** The character's skills and hub standing the rows were priced with; Offer Detail's "How many" walk reuses them. */
  skills: SkillLevels;
  standing: ResolvedStandings | undefined;
  /** For resolving a blueprint's material names in the detail panel. */
  catalog: BlueprintCatalog | null;
  /** The blueprint catalog couldn't load: blueprint offers list as plain items, with no build-versus-buy figures. */
  catalogUnavailable: boolean;
  /** Null until a cached LP balance exists; unknown is not zero. */
  playerLp: number | null;
  hub: TradeHub;
  hubHydrated: boolean;
  /** True once offers, the catalog and (when there are offers to price) a market snapshot have all loaded at least once. */
  ready: boolean;
  /** The price source could not be reached, so ISK/LP and profit are unknown, not zero. */
  pricesUnreachable: boolean;
  useOwnMaterialsFor: ReadonlySet<number>;
  toggleUseOwnMaterials: (offerId: number) => void;
}

export function useLoyaltyStoreOffers(corporationId: number): LoyaltyStoreResult {
  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const hubId = useMarketHub((s) => s.value);
  const hubHydrated = useMarketHub((s) => s.hydrated);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const priceBasis = usePriceBasis((s) => s.value);
  // Issue #1238: LP store offers carry no issuing-corp home station in this
  // app's data, so every offer prices standing against the configured Trade
  // Hub, same as the prices it already reads.
  const tradeHubStandings = useTradeHubStandings(activeCharacterId);
  const standing = tradeHubStanding(tradeHubStandings, hub.id);

  const [corpName, setCorpName] = useState<string | null>(null);
  const [offers, setOffers] = useState<LoyaltyStoreOffer[] | null>(null);
  const [offersFetchedAt, setOffersFetchedAt] = useState<Date | null>(null);
  const [offersFromCache, setOffersFromCache] = useState(false);
  const [offersError, setOffersError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // A catalog that couldn't load lists offers without build-versus-buy figures
  // until the connection returns, when it is fetched again.
  const {
    attempt: catalogAttempt,
    fail: failCatalog,
    clear: clearCatalogFailure,
  } = useRetryableLoad();
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  const [playerLp, setPlayerLp] = useState<number | null>(null);
  const [skills, setSkills] = useState<SkillLevels>({});
  const [itemNames, setItemNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [useOwnMaterialsFor, setUseOwnMaterialsFor] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setOffersError(false);
      const [{ result: offersResult, failed }, name] = await Promise.all([
        loadLoyaltyStoreOffersStatus(corporationId),
        loadCorporationName(corporationId),
      ]);
      if (cancelled) return;
      setOffersError(failed);
      setOffers(offersResult?.data ?? []);
      setOffersFetchedAt(offersResult?.fetchedAt ?? null);
      setOffersFromCache(offersResult?.fromCache ?? false);
      setCorpName(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [corporationId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    clearCatalogFailure();
    loadBlueprintCatalog().then(
      (cat) => {
        if (!cancelled) setCatalog(cat);
      },
      // Offers still list; they just carry no build-vs-buy figures.
      () => {
        if (cancelled) return;
        setCatalog(EMPTY_BLUEPRINT_CATALOG);
        failCatalog();
      }
    );
    return () => {
      cancelled = true;
    };
  }, [catalogAttempt, failCatalog, clearCatalogFailure]);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [lpResult, corrected] = await Promise.all([
        loadCharacterLoyaltyPoints(activeCharacterId),
        loadCorrectedSkills(activeCharacterId, Date.now(), { skipQueueWithoutScope: true }),
      ]);
      if (cancelled) return;
      // No cached read at all is unknown, not zero: an uncached device has
      // not learned the balance. A read that lists no entry for this
      // corporation is a real 0.
      if (lpResult.cached === null || lpResult.cached === undefined) setPlayerLp(null);
      else {
        const entry = lpResult.cached.data.find((e) => e.corporation_id === corporationId);
        setPlayerLp(entry?.loyalty_points ?? 0);
      }
      setSkills(skillLevelsOf(corrected));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId, corporationId]);

  const typeIds = useMemo(
    () => (offers && catalog ? offerPriceTypeIds(offers, catalog) : []),
    [offers, catalog]
  );

  const materialTypeIds = useMemo(() => {
    if (!offers || !catalog) return [];
    const ids = new Set<number>();
    for (const offer of offers) {
      const entry = catalog.byBlueprintTypeID.get(offer.type_id);
      if (entry) for (const m of entry.blueprint.materials) ids.add(m.typeID);
    }
    return [...ids];
  }, [offers, catalog]);

  // Every offer's own item name, plus every `required_items` turn-in —
  // resolved via `loadTypeNames` (SDE snapshot first, then a batched ESI call
  // for whatever it doesn't cover) rather than `blueprintCatalog`'s
  // `typesById`, which only carries types some blueprint or skill references.
  // LP stores hand out plenty that neither ever does (implants, Mindlinks,
  // SKINs), and required-item turn-ins (insignia, faction tags) are the same
  // case: prices for them already resolve via `typeIds` above, but names
  // don't unless this id set is widened the same way — see offerRows.ts's
  // `itemNames` and `collectNameableTypeIds`.
  const nameableTypeIds = useMemo(() => collectNameableTypeIds(offers ?? []), [offers]);

  useEffect(() => {
    if (nameableTypeIds.length === 0) return;
    let cancelled = false;
    void loadTypeNames(nameableTypeIds).then((names) => {
      if (!cancelled) setItemNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [nameableTypeIds]);

  const { volume } = useLpStoreVolume(hubHydrated ? hub.regionId : null);
  // Recent trades check each sale; until they settle nothing is ranked, so a lone overpriced listing never flashes first.
  const { demand, settled: demandSettled } = useHaulingDemand(hubHydrated ? hub.regionId : null);

  const ownedStockSnapshot = useOwnedStockSnapshot();
  const { stock } = useDetectedOwnedStock(ownedStockSnapshot, materialTypeIds);

  const materialSourcing = useMemo<MaterialSourcingMap | undefined>(() => {
    if (stock.size === 0) return undefined;
    const map: MaterialSourcingMap = {};
    // The required quantity varies per blueprint offer, so this only needs to
    // be an upper bound — buildVsBuy's own sourcing pass (sourcing.ts) clamps
    // to each build's actual requirement per material.
    for (const typeId of materialTypeIds) {
      const detected = stock.get(typeId);
      if (detected) map[typeId] = { ownedQuantity: detected.quantity };
    }
    return map;
  }, [stock, materialTypeIds]);

  // Withheld until the market hub setting hydrates — `useMarketSnapshot`
  // skips fetching whenever it's handed no type ids, same as the empty-list
  // case below it.
  const { snapshot } = useMarketSnapshot(hub, hubHydrated ? typeIds : []);

  const rows = useMemo(() => {
    if (!offers || !catalog || !snapshot) return [];
    return computeLoyaltyOfferRows({
      offers,
      catalog,
      hubPrices: snapshot.hubPrices,
      ...revenuePricing(snapshot, priceBasis),
      adjustedPrices: snapshot.adjustedPrices,
      systemCostIndex: snapshot.systemCostIndex,
      skills,
      standing,
      materialSourcing,
      itemNames,
      useOwnMaterialsFor,
      playerLp,
      sellsPerDayByType: volume,
      tradedPrices: demand?.types,
    });
  }, [
    offers,
    catalog,
    snapshot,
    priceBasis,
    skills,
    standing,
    materialSourcing,
    itemNames,
    useOwnMaterialsFor,
    playerLp,
    volume,
    demand,
  ]);

  function toggleUseOwnMaterials(offerId: number): void {
    setUseOwnMaterialsFor((prev) => {
      const next = new Set(prev);
      if (next.has(offerId)) next.delete(offerId);
      else next.add(offerId);
      return next;
    });
  }

  return {
    corpName,
    offersFetchedAt,
    offersFromCache,
    offersError,
    reloadOffers: () => {
      // Back to the spinner, not the empty-store copy, while the retry runs.
      setOffers(null);
      setReloadKey((k) => k + 1);
    },
    rows,
    catalog,
    playerLp,
    hub,
    skills,
    standing,
    hubHydrated,
    catalogUnavailable: catalog === EMPTY_BLUEPRINT_CATALOG,
    // A store with no offers has no prices to wait for, so `snapshot` stays
    // null for good: that is "no offers", not still loading.
    ready:
      offers !== null &&
      catalog !== null &&
      (typeIds.length === 0 || (snapshot !== null && demandSettled)),
    pricesUnreachable: snapshot?.hubPricesUnreachable === true,
    useOwnMaterialsFor,
    toggleUseOwnMaterials,
  };
}
