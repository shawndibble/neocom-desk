import { useCallback, useMemo, useRef, useState } from 'react';
import type { BlueprintSource } from '@/engine/industry/blueprintObtainability';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import {
  passesMarketWideFilters,
  type MarketWideFilters,
} from '@/engine/industry/marketWideFilters';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { TradeHub } from '@/market/hubs';
import type { MarketWideTreeMap } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { BuildPlanRecord } from '@/db';
import { planSettings } from './opportunities';
import { useLpValue } from '@/features/loyalty/lpValue';
import { useFacilityDefaults } from './facilityDefaults';
import { loadBlueprintSourceSets } from './blueprintSourceSets';
import { loadMarketWideProductFacts } from './marketWideProductFacts';
import {
  runMarketWideScan,
  type MarketWideResearch,
  type MarketWideResultRow,
  type MarketWideScanOptions,
} from './marketWideOpportunities';
import { marketWideScanKey, readMarketWideScan, writeMarketWideScan } from './marketWideScanCache';
import { usePricePercentFor } from '@/features/market/pagePricePercents';

export interface UseMarketWideOpportunitiesArgs {
  hub: TradeHub;
  trees: MarketWideTreeMap | null;
  catalog: BlueprintCatalog | null;
  modifiers: CharacterModifiers;
  standing?: ResolvedStandings;
  characterIds: readonly number[];
  characterId?: number | null;
  latestPlan?: BuildPlanRecord | null;
  research: MarketWideResearch;
  filters: MarketWideFilters;
  options?: Omit<MarketWideScanOptions, 'include' | 'research' | 'characterId'>;
}

export interface UseMarketWideOpportunitiesResult {
  rows: MarketWideResultRow[];
  loading: boolean;
  hasRun: boolean;
  error: boolean;
  fetchedAt: Date | null;
  unavailableSources: BlueprintSource[];
  run: (filters: MarketWideFilters) => void;
}

interface ScanState extends Omit<UseMarketWideOpportunitiesResult, 'run'> {
  key: string | null;
}

const NEVER_RUN: ScanState = {
  key: null,
  rows: [],
  loading: false,
  hasRun: false,
  error: false,
  fetchedAt: null,
  unavailableSources: [],
};

export function useMarketWideOpportunities({
  hub,
  trees,
  catalog,
  modifiers,
  standing,
  characterIds,
  characterId = null,
  latestPlan = null,
  research,
  filters,
  options,
}: UseMarketWideOpportunitiesArgs): UseMarketWideOpportunitiesResult {
  const [state, setState] = useState<ScanState>(NEVER_RUN);
  const facilityDefaults = useFacilityDefaults((value) => value.value);
  const lpValue = useLpValue((value) => value.value);
  const pricePercent = usePricePercentFor('industry');

  const keyFor = useCallback(
    (scanFilters: MarketWideFilters) =>
      marketWideScanKey({
        hubId: hub.id,
        tiers: scanFilters.tiers,
        categories: scanFilters.categories,
        sources: scanFilters.sources,
        characterIds,
        assumedMe: research.assumedMe,
        assumedTe: research.assumedTe,
        research: research.owned.map((copy) => ({
          blueprintTypeID: copy.type_id,
          me: copy.material_efficiency,
          te: copy.time_efficiency,
        })),
        modifiers,
        standing,
        facilityDefaults,
        lpValue,
        planSettings: planSettings(latestPlan),
        pricePercent,
      }),
    [
      hub.id,
      characterIds,
      research,
      modifiers,
      standing,
      facilityDefaults,
      lpValue,
      latestPlan,
      pricePercent,
    ]
  );
  const key = useMemo(() => keyFor(filters), [keyFor, filters]);
  const cached = useMemo(() => readMarketWideScan(key), [key]);

  const runToken = useRef(0);

  const run = useCallback(
    (filters: MarketWideFilters) => {
      if (!trees || !catalog) return;
      const token = ++runToken.current;
      const scanKey = keyFor(filters);
      setState((prev) => ({ ...prev, loading: true, error: false }));
      const blueprints = Object.entries(trees).map(([productTypeID, tree]) => ({
        blueprintTypeID: tree.blueprintTypeID,
        productTypeID: Number(productTypeID),
      }));
      const sources = loadBlueprintSourceSets(characterIds, blueprints);
      const sets = sources.then((loaded) => loaded.sets);
      const include = loadMarketWideProductFacts(trees).then(
        (facts) => (productTypeID: number, source: BlueprintSource) => {
          const fact = facts.get(productTypeID);
          return !fact || passesMarketWideFilters({ ...fact, source }, filters);
        },
        () => undefined
      );
      void Promise.all([
        runMarketWideScan(
          hub,
          trees,
          catalog,
          modifiers,
          sets,
          {
            ...options,
            research,
            characterId,
            pricePercent,
            include: include.then((check) => check ?? (() => true)),
          },
          standing
        ),
        sources,
      ])
        .then(([rows, loaded]) => {
          if (runToken.current !== token) return;
          const fetchedAt = Date.now();
          writeMarketWideScan(scanKey, {
            rows,
            fetchedAt,
            unavailableSources: loaded.unavailable,
          });
          setState({
            key: scanKey,
            rows,
            loading: false,
            hasRun: true,
            error: false,
            fetchedAt: new Date(fetchedAt),
            unavailableSources: loaded.unavailable,
          });
        })
        .catch(() => {
          if (runToken.current !== token) return;
          setState({
            key: scanKey,
            rows: [],
            loading: false,
            hasRun: true,
            error: true,
            fetchedAt: null,
            unavailableSources: [],
          });
        });
    },
    [
      hub,
      trees,
      catalog,
      modifiers,
      options,
      standing,
      characterIds,
      characterId,
      research,
      keyFor,
      pricePercent,
    ]
  );

  const shown: ScanState =
    state.loading || state.key === key
      ? state
      : cached
        ? {
            key,
            rows: cached.rows,
            loading: false,
            hasRun: true,
            error: false,
            fetchedAt: new Date(cached.fetchedAt),
            unavailableSources: cached.unavailableSources,
          }
        : NEVER_RUN;
  const { rows, loading, hasRun, error, fetchedAt, unavailableSources } = shown;
  return { rows, loading, hasRun, error, fetchedAt, unavailableSources, run };
}
