/**
 * The data behind the LP Store page's item-first search (issue #2873): the
 * `lpStoreOffers` snapshot, names for its items and corporations, the jumps
 * from the Current System, and — for the offers the search actually shows —
 * the same profit and ISK/LP numbers a single store computes
 * (`computeLoyaltyOfferRows`), priced at the page's hub and price basis.
 *
 * The matching itself is `itemSearch.ts`. Prices are never in the snapshot:
 * they are fetched for the handful of matched offers only, so a query that
 * matches a dozen items prices a dozen items rather than every store.
 */
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useMarketHub } from '@/features/market/hub';
import { getTradeHub, DEFAULT_TRADE_HUB } from '@/market/hubs';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { useJumpRangeFilter } from '@/features/route/currentSystem';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { useMarketSnapshot } from '@/features/industry/useMarketSnapshot';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadLpCorporations } from '@/sde/loadMarketSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import type { SkillLevels } from '@/engine/industry/types';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { usePriceBasis } from './priceBasis';
import { loadLpStoreSnapshot } from './lpStoreSnapshot';
import { searchLpStores, type LpSearchResult, type LpSnapshotStore } from './itemSearch';
import { computeLoyaltyOfferRows, offerPriceTypeIds, type LoyaltyOfferRow } from './offerRows';

export type LpSearchStatus = 'loading' | 'ready' | 'unavailable';

export interface LpStoreSearchState {
  status: LpSearchStatus;
  /** When the backend last published the snapshot. */
  syncedAt: number | null;
  result: LpSearchResult;
  /** Matched offers' rows, keyed by the offer object the result carries. */
  rowFor: (offer: LoyaltyStoreOffer) => LoyaltyOfferRow | null;
  systemName: (systemId: number | null) => string | null;
  /** The Current System is set and distances are resolved, for the note above the results. */
  jumpsStatus: 'no-origin' | 'loading' | 'unknown' | 'ready';
  /** Prices for the matched offers are still loading. */
  pricing: boolean;
}

const EMPTY_RESULT: LpSearchResult = { groups: [], corporations: [], totalItemMatches: 0 };

export function useLpStoreSearch(query: string): LpStoreSearchState {
  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const hubId = useMarketHub((s) => s.value);
  const hubHydrated = useMarketHub((s) => s.hydrated);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const priceBasis = usePriceBasis((s) => s.value);
  const standing = tradeHubStanding(useTradeHubStandings(activeCharacterId), hub.id);

  const current = useCurrentSystem();
  const { jumps, jumpsStatus } = useJumpRangeFilter(current, 'any');

  const [stores, setStores] = useState<LpSnapshotStore[] | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [corporationNames, setCorporationNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [itemNames, setItemNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [systemNames, setSystemNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  const [skills, setSkills] = useState<SkillLevels>({});

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void loadLpStoreSnapshot(activeCharacterId)
      .then((read) => {
        if (cancelled) return;
        const data = read.cached?.data ?? null;
        setStores(data?.rows ?? null);
        setSyncedAt(data?.lastSyncedAt ?? null);
        setFailed(data === null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  useEffect(() => {
    let cancelled = false;
    void loadLpCorporations()
      .then((corps) => {
        if (!cancelled) setCorporationNames(new Map(corps.map((corp) => [corp.id, corp.name])));
      })
      .catch(() => {});
    void loadSolarSystemsById().then((byId) => {
      if (cancelled || !byId) return;
      setSystemNames(new Map([...byId].map(([id, entry]) => [id, entry.name])));
    });
    void loadBlueprintCatalog().then((cat) => {
      if (!cancelled) setCatalog(cat);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Every item in the snapshot needs a name to be searchable by it.
  useEffect(() => {
    if (!stores) return;
    const ids = new Set<number>();
    for (const store of stores) for (const offer of store.offers) ids.add(offer[1]);
    let cancelled = false;
    void loadTypeNames([...ids]).then((names) => {
      if (!cancelled) setItemNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [stores]);

  const deferredQuery = useDeferredValue(query);
  const result = useMemo(
    () =>
      stores
        ? searchLpStores({ stores, corporationNames, itemNames, query: deferredQuery, jumps })
        : EMPTY_RESULT,
    [stores, corporationNames, itemNames, deferredQuery, jumps]
  );

  const matchedOffers = useMemo(
    () => result.groups.flatMap((group) => group.stores.map((store) => store.offer)),
    [result]
  );
  const typeIds = useMemo(
    () => (catalog ? offerPriceTypeIds(matchedOffers, catalog) : []),
    [matchedOffers, catalog]
  );
  const { snapshot, loading: snapshotLoading } = useMarketSnapshot(hub, hubHydrated ? typeIds : []);

  const rowsByOffer = useMemo(() => {
    const map = new Map<LoyaltyStoreOffer, LoyaltyOfferRow>();
    if (!catalog || !snapshot || matchedOffers.length === 0) return map;
    const rows = computeLoyaltyOfferRows({
      offers: matchedOffers,
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
      // Affordability is not part of a cross-store search, so no LP is held.
      playerLp: 0,
    });
    for (const row of rows) map.set(row.offer, row);
    return map;
  }, [catalog, snapshot, matchedOffers, priceBasis, skills, standing, itemNames]);

  return {
    status:
      stores !== null ? 'ready' : failed || activeCharacterId === null ? 'unavailable' : 'loading',
    syncedAt,
    result,
    rowFor: (offer) => rowsByOffer.get(offer) ?? null,
    systemName: (systemId) => (systemId === null ? null : (systemNames.get(systemId) ?? null)),
    jumpsStatus,
    pricing: matchedOffers.length > 0 && (snapshotLoading || snapshot === null),
  };
}
