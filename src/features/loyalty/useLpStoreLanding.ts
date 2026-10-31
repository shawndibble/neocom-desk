/**
 * The data behind the LP Store landing's Stores and Offers views
 * (`lpLanding.ts`): the LP offers snapshot (R2), every offer priced the way a
 * single store prices it (`computeLoyaltyOfferRows`, at the page's hub and
 * price basis, with the Character's skills and standing), each store's
 * market LP Value, the Character's balances, factions, item categories and
 * the jumps from the Current System.
 *
 * Every offer is priced: about 3,700 types in one market fetch (cached), and
 * one pass over ~31,000 offers (tens of milliseconds). The pass waits for the
 * catalog, the prices, the names and the daily volume, so the sales floor
 * never flashes a list that then shrinks.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useMarketHub } from '@/features/market/hub';
import { getTradeHub, DEFAULT_TRADE_HUB } from '@/market/hubs';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { useCurrentSystem, useJumpRangeFilter } from '@/features/route/currentSystem';
import {
  EMPTY_BLUEPRINT_CATALOG,
  loadBlueprintCatalog,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { useMarketSnapshot } from '@/features/industry/useMarketSnapshot';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { loadFactions } from '@/features/standings/factions';
import { rootOf } from '@/features/market/marketTree';
import { loadLpCorporations, loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import type { LpCorporationEntry } from '@/sde/marketTypes';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import type { CharacterLoyaltyPoints, LoyaltyStoreOffer, UniverseFaction } from '@/esi/endpoints';
import type { SkillLevels } from '@/engine/industry/types';
import { usePriceBasis } from './priceBasis';
import { loadLpStoreVolume, type LpStoreVolume } from './lpStoreVolume';
import { loadMarketLpValues } from './marketLpValue';
import {
  loadLpStoreSnapshot,
  nearestStation,
  toStoreOffer,
  type LpSnapshotStore,
} from './lpStoreSnapshot';
import { collectNameableTypeIds, computeLoyaltyOfferRows, offerPriceTypeIds } from './offerRows';
import type { LpLandingOffer, LpLandingStoreFacts } from './lpLanding';

export type LpLandingStatus = 'loading' | 'ready' | 'unavailable';

export interface LpLandingOption {
  id: number;
  name: string;
}

export interface LpStoreLandingState {
  status: LpLandingStatus;
  /** When the backend last published the offers snapshot. */
  syncedAt: number | null;
  stores: LpLandingStoreFacts[];
  /** Empty until every offer is priced (`pricing`). */
  offers: LpLandingOffer[];
  /** Offers are still being priced. */
  pricing: boolean;
  /** LP Values are still being worked out. */
  valuing: boolean;
  /** The Character's balances have been read (an empty list then means none held). */
  balancesKnown: boolean;
  systemName: (systemId: number) => string | null;
  factionName: (factionId: number) => string | null;
  /** The Current System is set and distances are resolved. */
  jumpsStatus: 'no-origin' | 'loading' | 'unknown' | 'ready';
  /** Factions with an LP Store, by name; empty when ESI's faction list is unavailable. */
  factions: LpLandingOption[];
  /** Root Market Groups of the offered items, by name. */
  categories: LpLandingOption[];
}

interface Categories {
  categoryOf: ReadonlyMap<number, number>;
  names: ReadonlyMap<number, string>;
}

/**
 * `active` false while a store's modal covers the landing: the snapshot and
 * names still load, but nothing is priced, so a store opened by a link does
 * not price every other store behind it.
 */
export function useLpStoreLanding(active = true): LpStoreLandingState {
  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const hubId = useMarketHub((s) => s.value);
  const hubHydrated = useMarketHub((s) => s.hydrated);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const priceBasis = usePriceBasis((s) => s.value);
  const standing = tradeHubStanding(useTradeHubStandings(activeCharacterId), hub.id);
  const { jumps, jumpsStatus } = useJumpRangeFilter(useCurrentSystem(), 'any');

  const [snapshotRows, setSnapshotRows] = useState<LpSnapshotStore[] | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [corporations, setCorporations] = useState<LpCorporationEntry[]>([]);
  const [factionList, setFactionList] = useState<UniverseFaction[] | null>(null);
  const [categories, setCategories] = useState<Categories | null>(null);
  const [itemNames, setItemNames] = useState<ReadonlyMap<number, string> | null>(null);
  const [systemNames, setSystemNames] = useState<ReadonlyMap<number, string>>(new Map());
  const {
    attempt: catalogAttempt,
    fail: failCatalog,
    clear: clearCatalogFailure,
  } = useRetryableLoad();
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  const [skills, setSkills] = useState<SkillLevels>({});

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
    void loadSolarSystemsById().then((byId) => {
      if (cancelled || !byId) return;
      setSystemNames(new Map([...byId].map(([id, entry]) => [id, entry.name])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The market catalogue is large; it is read only once the landing is on screen.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // Categories only add a filter: a failed read leaves every offer uncategorised.
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
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    clearCatalogFailure();
    loadBlueprintCatalog().then(
      (cat) => {
        if (!cancelled) setCatalog(cat);
      },
      // Offers still list; blueprint offers just carry no build cost.
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

  // Keyed on the Character, so a switch never shows the previous one's balances.
  const [balances, setBalances] = useState<{
    characterId: number | null;
    list: CharacterLoyaltyPoints[] | null;
  }>({ characterId: activeCharacterId, list: null });
  if (balances.characterId !== activeCharacterId) {
    setBalances({ characterId: activeCharacterId, list: null });
  }
  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void loadCharacterLoyaltyPoints(activeCharacterId)
      .then((read) => {
        if (!cancelled)
          setBalances({ characterId: activeCharacterId, list: read.cached?.data ?? [] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void loadCorrectedSkills(activeCharacterId, Date.now(), { skipQueueWithoutScope: true }).then(
      (corrected) => {
        if (cancelled) return;
        const map: SkillLevels = {};
        for (const [skillId, trained] of corrected.trained) map[skillId] = trained.level;
        setSkills(map);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  // The hub setting's region, once it hydrates: the default hub's volume would be the wrong number.
  const volumeRegionId = hubHydrated ? hub.regionId : null;
  const [loadedVolume, setLoadedVolume] = useState<{
    regionId: number;
    volume: LpStoreVolume | null;
  } | null>(null);
  useEffect(() => {
    if (volumeRegionId === null) return;
    let cancelled = false;
    void loadLpStoreVolume(volumeRegionId).then((volume) => {
      if (!cancelled) setLoadedVolume({ regionId: volumeRegionId, volume });
    });
    return () => {
      cancelled = true;
    };
  }, [volumeRegionId]);
  const volumeSettled = loadedVolume !== null && loadedVolume.regionId === volumeRegionId;
  const volume = volumeSettled ? loadedVolume.volume : null;

  const offersByCorp = useMemo(() => {
    const map = new Map<number, LoyaltyStoreOffer[]>();
    for (const store of snapshotRows ?? []) {
      map.set(store.corporationId, store.offers.map(toStoreOffer));
    }
    return map;
  }, [snapshotRows]);
  const allOffers = useMemo(() => [...offersByCorp.values()].flat(), [offersByCorp]);

  useEffect(() => {
    if (!active || allOffers.length === 0) return;
    let cancelled = false;
    void loadTypeNames(collectNameableTypeIds(allOffers)).then((names) => {
      if (!cancelled) setItemNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [active, allOffers]);

  const typeIds = useMemo(
    () => (active && catalog ? offerPriceTypeIds(allOffers, catalog) : []),
    [active, allOffers, catalog]
  );
  const { snapshot, loading: snapshotLoading } = useMarketSnapshot(hub, hubHydrated ? typeIds : []);

  // Market LP Values: priced for no particular pilot, the figure every other page uses.
  const [lpValues, setLpValues] = useState<{
    hubId: string;
    values: Map<number, number | null>;
  } | null>(null);
  useEffect(() => {
    if (!active || !hubHydrated || offersByCorp.size === 0) return;
    let cancelled = false;
    void loadMarketLpValues(offersByCorp.keys(), hub, Date.now, offersByCorp)
      .then((values) => {
        if (!cancelled) setLpValues({ hubId: hub.id, values });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // `hub` is derived from `hubId`; the id is the stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hubHydrated, hubId, offersByCorp]);
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

  const ready = catalog !== null && snapshot !== null && itemNames !== null && volumeSettled;
  const rows = useMemo(() => {
    if (!ready) return null;
    return computeLoyaltyOfferRows({
      offers: allOffers,
      catalog,
      hubPrices: snapshot.hubPrices,
      revenueHubPrices: priceBasis === 'buy' ? snapshot.hubBuyPrices : snapshot.hubPrices,
      liquidationBasis: priceBasis === 'buy' ? 'instant' : 'order',
      adjustedPrices: snapshot.adjustedPrices,
      systemCostIndex: snapshot.systemCostIndex,
      skills,
      standing,
      materialSourcing: undefined,
      itemNames,
      // Affordability is per store here (`lpLanding.ts`), from each balance.
      playerLp: null,
      sellsPerDayByType: volume,
    });
  }, [ready, allOffers, catalog, snapshot, priceBasis, skills, standing, itemNames, volume]);

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
    (systemId: number) => systemNames.get(systemId) ?? null,
    [systemNames]
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
    systemName,
    factionName,
    jumpsStatus,
    factions,
    categories: categoryOptions,
  };
}
