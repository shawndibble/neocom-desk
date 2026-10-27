/**
 * Drives the Market-Wide Build Opportunities scan (issue #819) as an
 * explicit, opt-in action — unlike `useOpportunities`, this never fetches on
 * mount: the ticket calls out that a market-wide sweep must never run just
 * because the tab was visited.
 */
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

export interface UseMarketWideOpportunitiesArgs {
  hub: TradeHub;
  trees: MarketWideTreeMap | null;
  catalog: BlueprintCatalog | null;
  /** For the job-fee/sales-tax/broker-fee terms — same skills the owned-blueprint panel already reads. */
  modifiers: CharacterModifiers;
  /** The character's standing toward `hub`'s NPC owner (issue #1238). Absent/0 = standings assumed 0. */
  standing?: ResolvedStandings;
  /** Every Character on the account — whose blueprints, contracts and LP decide what the pilot can build. */
  characterIds: readonly number[];
  /** Whose Build Plans rows are priced as — the active Character. Null while none is active. */
  characterId?: number | null;
  /** That Character's latest plan, whose hub, price basis and build location rows start from. */
  latestPlan?: BuildPlanRecord | null;
  /** The ME/TE rows are priced at, and so the one a plan opened from a row starts at (issue #5232). */
  research: MarketWideResearch;
  /**
   * The filters the scan being shown ran with. A scan cached under these (and
   * the other inputs) and still fresh is shown without fetching; any other
   * is never shown as current.
   */
  filters: MarketWideFilters;
  options?: Omit<MarketWideScanOptions, 'include' | 'research' | 'characterId'>;
}

export interface UseMarketWideOpportunitiesResult {
  rows: MarketWideResultRow[];
  loading: boolean;
  /** True once a scan has completed at least once — distinguishes "never run" from "ran, found nothing". */
  hasRun: boolean;
  error: boolean;
  /** When the last successful scan finished; null before one has. */
  fetchedAt: Date | null;
  /** Blueprint sources the last scan couldn't read — rows needing one may be missing. */
  unavailableSources: BlueprintSource[];
  /**
   * Scans with `filters` (tiers, categories, blueprint sources). They apply
   * before the top-N cut, so a filter change needs a fresh scan rather than
   * hiding rows from the last one; product prices are cached by then.
   */
  run: (filters: MarketWideFilters) => void;
}

interface ScanState extends Omit<UseMarketWideOpportunitiesResult, 'run'> {
  /** The inputs the rows were scanned at; null before any scan. */
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
  // Both move a row's price, so a scan made before they changed is not this one.
  const facilityDefaults = useFacilityDefaults((value) => value.value);
  const lpValue = useLpValue((value) => value.value);

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
      }),
    [hub.id, characterIds, research, modifiers, standing, facilityDefaults, lpValue, latestPlan]
  );
  const key = useMemo(() => keyFor(filters), [keyFor, filters]);
  // A scan this session ran, at these inputs, and the prices still hold.
  // Memoised on the key: reading the clock per render would let rows expire mid-view.
  const cached = useMemo(() => readMarketWideScan(key), [key]);

  // Guards against a stale scan's result landing after a newer one started
  // (e.g. the pilot hits "Scan" twice in a row).
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
      // Unreadable market files filter nothing rather than failing the scan.
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
    [hub, trees, catalog, modifiers, options, standing, characterIds, characterId, research, keyFor]
  );

  // The scan in flight, or the one that ran at exactly these inputs, wins;
  // else a fresh cached one; else nothing has run at these inputs.
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
