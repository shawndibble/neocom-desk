import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useHubFor } from '@/features/market/hub';
import { getTradeHub, DEFAULT_TRADE_HUB } from '@/market/hubs';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { useCurrentSystem, useJumpRangeFilter } from '@/features/route/currentSystem';
import {
  EMPTY_BLUEPRINT_CATALOG,
  loadBlueprintCatalog,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { useMarketSnapshot } from '@/features/industry/useMarketSnapshot';
import { loadCorrectedSkills, skillLevelsOf } from '@/features/skills/correctedSkills';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { loadFactions } from '@/features/standings/factions';
import { rootOf } from '@/features/market/marketTree';
import { loadLpCorporations, loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import type { LpCorporationEntry } from '@/sde/marketTypes';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import type { CharacterLoyaltyPoints, LoyaltyStoreOffer, UniverseFaction } from '@/esi/endpoints';
import type { SkillLevels } from '@/engine/industry/types';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { lpPricesAtPercent, revenuePricing, usePriceBasis } from './priceBasis';
import { useLpStoreVolume } from './lpStoreVolume';
import { useHaulingDemand } from '@/features/market/haulingDemand';
import { loadMarketLpValues } from './marketLpValue';
import {
  loadLpStoreSnapshot,
  nearestStation,
  toStoreOffer,
  type LpSnapshotStore,
} from './lpStoreSnapshot';
import { collectNameableTypeIds, computeLoyaltyOfferRows, offerPriceTypeIds } from './offerRows';
import type { LpLandingOffer, LpLandingStoreFacts } from './lpLanding';

type LpLandingStatus = 'loading' | 'ready' | 'unavailable';

export interface LpLandingOption {
  id: number;
  name: string;
}

export interface LpStoreLandingState {
  status: LpLandingStatus;
  syncedAt: number | null;
  stores: LpLandingStoreFacts[];
  offers: LpLandingOffer[];
  pricing: boolean;
  valuing: boolean;
  balancesKnown: boolean;
  balancesSettled: boolean;
  systemName: (systemId: number) => string | null;
  factionName: (factionId: number) => string | null;
  jumpsStatus: 'no-origin' | 'loading' | 'unknown' | 'ready';
  factions: LpLandingOption[];
  categories: LpLandingOption[];
}

interface Categories {
  categoryOf: ReadonlyMap<number, number>;
  names: ReadonlyMap<number, string>;
}

export function useLpStoreLanding(active = true): LpStoreLandingState {
  const [warmed, setWarmed] = useState(active);
  if (active && !warmed) setWarmed(true);
  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const { hubId, hydrated: hubHydrated } = useHubFor('lpStore');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const priceBasis = usePriceBasis((s) => s.value);
  const pricePercent = usePricePercentFor('lpStore');
  const standing = tradeHubStanding(useTradeHubStandings(activeCharacterId), hub.id);
  const { jumps, jumpsStatus } = useJumpRangeFilter(useCurrentSystem(), 'any');

  const [snapshotRows, setSnapshotRows] = useState<LpSnapshotStore[] | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [corporations, setCorporations] = useState<LpCorporationEntry[]>([]);
  const [factionList, setFactionList] = useState<UniverseFaction[] | null>(null);
  const [categories, setCategories] = useState<Categories | null>(null);
  const [itemNames, setItemNames] = useState<ReadonlyMap<number, string> | null>(null);
  const systemIndex = useSolarSystemIndex();
  const {
    attempt: catalogAttempt,
    fail: failCatalog,
    clear: clearCatalogFailure,
  } = useRetryableLoad();
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  const [skillsFor, setSkillsFor] = useState<{ characterId: number | null; skills: SkillLevels }>({
    characterId: activeCharacterId,
    skills: {},
  });
  if (skillsFor.characterId !== activeCharacterId) {
    setSkillsFor({ characterId: activeCharacterId, skills: {} });
  }
  const skills = skillsFor.skills;

  useEffect(() => {
    let cancelled = false;
    void loadLpStoreSnapshot()
      .then((read) => {
        if (cancelled) return;
        const data = read.cached?.data ?? null;
        setSnapshotRows(data?.rows ?? null);
        setSyncedAt(data?.lastSyncedAt ?? null);
        setFailed(data === null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadLpCorporations()
      .then((corps) => {
        if (!cancelled) setCorporations(corps);
      })
      .catch(() => {});
    void loadFactions().then((list) => {
      if (!cancelled) setFactionList(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!warmed) return;
    let cancelled = false;
    void Promise.all([loadMarketTypes(), loadMarketGroups()])
      .then(([types, groups]) => {
        if (cancelled) return;
        const groupsById = new Map(groups.map((group) => [group.id, group]));
        const categoryOf = new Map<number, number>();
        for (const type of types)
          categoryOf.set(type.typeId, rootOf(type.marketGroupId, groupsById));
        const names = new Map(groups.filter((g) => g.parentId === null).map((g) => [g.id, g.name]));
        setCategories({ categoryOf, names });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [warmed]);

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

  const [balances, setBalances] = useState<{
    characterId: number | null;
    list: CharacterLoyaltyPoints[] | null;
    settled: boolean;
  }>({ characterId: activeCharacterId, list: null, settled: false });
  if (balances.characterId !== activeCharacterId) {
    setBalances({ characterId: activeCharacterId, list: null, settled: false });
  }
  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void loadCharacterLoyaltyPoints(activeCharacterId)
      .then((read) => {
        if (!cancelled)
          setBalances({
            characterId: activeCharacterId,
            list: read.cached?.data ?? [],
            settled: true,
          });
      })
      .catch((err: unknown) => {
        console.warn('LP balances could not be read', err);
        if (!cancelled) setBalances({ characterId: activeCharacterId, list: null, settled: true });
      });
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void loadCorrectedSkills(activeCharacterId, Date.now(), { skipQueueWithoutScope: true })
      .then((corrected) => {
        if (cancelled) return;
        setSkillsFor({ characterId: activeCharacterId, skills: skillLevelsOf(corrected) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  const { volume, settled: volumeSettled } = useLpStoreVolume(hubHydrated ? hub.regionId : null);
  const { demand, settled: demandSettled } = useHaulingDemand(hubHydrated ? hub.regionId : null);

  const offersByCorp = useMemo(() => {
    const map = new Map<number, LoyaltyStoreOffer[]>();
    for (const store of snapshotRows ?? []) {
      map.set(store.corporationId, store.offers.map(toStoreOffer));
    }
    return map;
  }, [snapshotRows]);
  const allOffers = useMemo(() => [...offersByCorp.values()].flat(), [offersByCorp]);

  useEffect(() => {
    if (!warmed || allOffers.length === 0) return;
    let cancelled = false;
    void loadTypeNames(collectNameableTypeIds(allOffers))
      .then((names) => {
        if (!cancelled) setItemNames(names);
      })
      .catch(() => {
        if (!cancelled) setItemNames(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [warmed, allOffers]);

  const typeIds = useMemo(
    () => (warmed && catalog ? offerPriceTypeIds(allOffers, catalog) : []),
    [warmed, allOffers, catalog]
  );
  const { snapshot, loading: snapshotLoading } = useMarketSnapshot(hub, hubHydrated ? typeIds : []);

  const [lpValues, setLpValues] = useState<{
    hubId: string;
    values: Map<number, number | null>;
  } | null>(null);
  useEffect(() => {
    if (!warmed || !hubHydrated || offersByCorp.size === 0) return;
    let cancelled = false;
    void loadMarketLpValues(offersByCorp.keys(), hub, { held: offersByCorp })
      .then((values) => {
        if (!cancelled) setLpValues({ hubId: hub.id, values });
      })
      .catch(() => {
        if (!cancelled) setLpValues({ hubId: hub.id, values: new Map() });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmed, hubHydrated, hubId, offersByCorp]);
  const valuesForHub = lpValues?.hubId === hub.id ? lpValues.values : null;

  const corporationById = useMemo(
    () => new Map(corporations.map((corp) => [corp.id, corp] as const)),
    [corporations]
  );
  const militias = useMemo(
    () =>
      new Set(
        (factionList ?? []).flatMap((f) =>
          f.militia_corporation_id === undefined ? [] : [f.militia_corporation_id]
        )
      ),
    [factionList]
  );
  const balanceByCorp = useMemo(
    () => new Map((balances.list ?? []).map((b) => [b.corporation_id, b.loyalty_points] as const)),
    [balances.list]
  );

  const stores = useMemo<LpLandingStoreFacts[]>(
    () =>
      (snapshotRows ?? []).map((row) => {
        const corp = corporationById.get(row.corporationId);
        const lp = balanceByCorp.get(row.corporationId);
        return {
          corporationId: row.corporationId,
          name: corp?.name ?? `#${row.corporationId}`,
          factionId: corp?.factionId ?? null,
          factionWarfare: militias.has(row.corporationId),
          nearest: nearestStation(row.systemIds, jumps),
          yourLp: lp !== undefined && lp > 0 ? lp : null,
          lpValue: valuesForHub?.get(row.corporationId) ?? null,
          offerCount: row.offers.length,
        };
      }),
    [snapshotRows, corporationById, balanceByCorp, militias, jumps, valuesForHub]
  );

  const ready =
    catalog !== null && snapshot !== null && itemNames !== null && volumeSettled && demandSettled;
  const rows = useMemo(() => {
    if (!ready) return null;
    const priced = lpPricesAtPercent(snapshot, demand?.types, pricePercent);
    return computeLoyaltyOfferRows({
      offers: allOffers,
      catalog,
      hubPrices: priced.snapshot.hubPrices,
      ...revenuePricing(priced.snapshot, priceBasis),
      adjustedPrices: snapshot.adjustedPrices,
      systemCostIndex: snapshot.systemCostIndex,
      regionalTaxPct: snapshot.regionalTaxPct,
      skills,
      standing,
      materialSourcing: undefined,
      itemNames,
      playerLp: null,
      sellsPerDayByType: volume,
      tradedPrices: priced.tradedPrices,
    });
  }, [
    ready,
    allOffers,
    catalog,
    snapshot,
    priceBasis,
    pricePercent,
    skills,
    standing,
    itemNames,
    volume,
    demand,
  ]);

  const offers = useMemo<LpLandingOffer[]>(() => {
    if (!rows) return [];
    const storeById = new Map(stores.map((store) => [store.corporationId, store] as const));
    const storeOfOffer = new Map<LoyaltyStoreOffer, LpLandingStoreFacts>();
    for (const [corporationId, list] of offersByCorp) {
      const store = storeById.get(corporationId);
      if (store) for (const offer of list) storeOfOffer.set(offer, store);
    }
    return rows.flatMap((row) => {
      const store = storeOfOffer.get(row.offer);
      if (!store) return [];
      return [{ row, store, categoryId: categories?.categoryOf.get(row.offer.type_id) ?? null }];
    });
  }, [rows, stores, offersByCorp, categories]);

  const factions = useMemo<LpLandingOption[]>(() => {
    const withStore = new Set(stores.flatMap((s) => (s.factionId === null ? [] : [s.factionId])));
    return (factionList ?? [])
      .filter((f) => withStore.has(f.faction_id))
      .map((f) => ({ id: f.faction_id, name: f.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [factionList, stores]);

  const categoryOptions = useMemo<LpLandingOption[]>(() => {
    if (!categories) return [];
    const present = new Set(offers.flatMap((o) => (o.categoryId === null ? [] : [o.categoryId])));
    return [...present]
      .flatMap((id) => {
        const name = categories.names.get(id);
        return name === undefined ? [] : [{ id, name }];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, offers]);

  const systemName = useCallback(
    (systemId: number) => systemIndex?.get(systemId)?.name ?? null,
    [systemIndex]
  );
  const factionNames = useMemo(
    () => new Map((factionList ?? []).map((f) => [f.faction_id, f.name] as const)),
    [factionList]
  );
  const factionName = useCallback(
    (factionId: number) => factionNames.get(factionId) ?? null,
    [factionNames]
  );

  return {
    status: snapshotRows !== null ? 'ready' : failed ? 'unavailable' : 'loading',
    syncedAt,
    stores,
    offers,
    pricing: snapshotRows !== null && (rows === null || snapshotLoading),
    valuing: snapshotRows !== null && valuesForHub === null,
    balancesKnown: activeCharacterId !== null && balances.list !== null,
    balancesSettled: activeCharacterId === null || balances.settled,
    systemName,
    factionName,
    jumpsStatus,
    factions,
    categories: categoryOptions,
  };
}
