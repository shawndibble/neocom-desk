import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useHubFor } from '@/features/market/hub';
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
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { lpPricesAtPercent, revenuePricing, usePriceBasis, type PriceBasis } from './priceBasis';
import { useLpStoreVolume } from './lpStoreVolume';
import { useHaulingDemand } from '@/features/market/haulingDemand';
import {
  useDetectedOwnedStock,
  useOwnedStockSnapshot,
} from '@/features/industry/useDetectedOwnedStock';
import type { OwnedStockSnapshot } from '@/features/industry/ownedStockDetection';
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
  offersError: boolean;
  reloadOffers: () => void;
  rows: LoyaltyOfferRow[];
  instantIskPerLp: ReadonlyMap<number, number | null>;
  skills: SkillLevels;
  standing: ResolvedStandings | undefined;
  catalog: BlueprintCatalog | null;
  catalogUnavailable: boolean;
  playerLp: number | null;
  hub: TradeHub;
  hubHydrated: boolean;
  ready: boolean;
  pricesUnreachable: boolean;
  useOwnMaterialsFor: ReadonlySet<number>;
  toggleUseOwnMaterials: (offerId: number) => void;
  ownedStockSnapshot: OwnedStockSnapshot;
}

export function useLoyaltyStoreOffers(corporationId: number): LoyaltyStoreResult {
  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const { hubId, hydrated: hubHydrated } = useHubFor('lpStore');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const priceBasis = usePriceBasis((s) => s.value);
  const pricePercent = usePricePercentFor('lpStore');
  const tradeHubStandings = useTradeHubStandings(activeCharacterId);
  const standing = tradeHubStanding(tradeHubStandings, hub.id);

  const [corpName, setCorpName] = useState<string | null>(null);
  const [offers, setOffers] = useState<LoyaltyStoreOffer[] | null>(null);
  const [offersFetchedAt, setOffersFetchedAt] = useState<Date | null>(null);
  const [offersFromCache, setOffersFromCache] = useState(false);
  const [offersError, setOffersError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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
  const { demand, settled: demandSettled } = useHaulingDemand(hubHydrated ? hub.regionId : null);

  const ownedStockSnapshot = useOwnedStockSnapshot();
  const { stock } = useDetectedOwnedStock(ownedStockSnapshot, materialTypeIds);

  const materialSourcing = useMemo<MaterialSourcingMap | undefined>(() => {
    if (stock.size === 0) return undefined;
    const map: MaterialSourcingMap = {};
    for (const typeId of materialTypeIds) {
      const detected = stock.get(typeId);
      if (detected) map[typeId] = { ownedQuantity: detected.quantity };
    }
    return map;
  }, [stock, materialTypeIds]);

  const { snapshot: hubSnapshot } = useMarketSnapshot(hub, hubHydrated ? typeIds : []);
  const priced = useMemo(
    () => (hubSnapshot ? lpPricesAtPercent(hubSnapshot, demand?.types, pricePercent) : null),
    [hubSnapshot, demand, pricePercent]
  );
  const snapshot = priced?.snapshot ?? null;

  const rowsOn = useCallback(
    (basis: PriceBasis): LoyaltyOfferRow[] => {
      if (!offers || !catalog || !snapshot) return [];
      return computeLoyaltyOfferRows({
        offers,
        catalog,
        hubPrices: snapshot.hubPrices,
        ...revenuePricing(snapshot, basis),
        adjustedPrices: snapshot.adjustedPrices,
        systemCostIndex: snapshot.systemCostIndex,
        regionalTaxPct: snapshot.regionalTaxPct,
        skills,
        standing,
        materialSourcing,
        itemNames,
        useOwnMaterialsFor,
        playerLp,
        sellsPerDayByType: volume,
        tradedPrices: priced?.tradedPrices,
      });
    },
    [
      offers,
      catalog,
      snapshot,
      skills,
      standing,
      materialSourcing,
      itemNames,
      useOwnMaterialsFor,
      playerLp,
      volume,
      priced,
    ]
  );
  const rows = useMemo(() => rowsOn(priceBasis), [rowsOn, priceBasis]);
  const instantIskPerLp = useMemo(
    () =>
      new Map(
        (priceBasis === 'buy' ? rows : rowsOn('buy')).map((row) => [
          row.offer.offer_id,
          row.profit.iskPerLp,
        ])
      ),
    [rows, rowsOn, priceBasis]
  );

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
      setOffers(null);
      setReloadKey((k) => k + 1);
    },
    rows,
    instantIskPerLp,
    catalog,
    playerLp,
    hub,
    skills,
    standing,
    hubHydrated,
    catalogUnavailable: catalog === EMPTY_BLUEPRINT_CATALOG,
    ready:
      offers !== null &&
      catalog !== null &&
      (typeIds.length === 0 || (snapshot !== null && demandSettled)),
    pricesUnreachable: snapshot?.hubPricesUnreachable === true,
    useOwnMaterialsFor,
    toggleUseOwnMaterials,
    ownedStockSnapshot,
  };
}
