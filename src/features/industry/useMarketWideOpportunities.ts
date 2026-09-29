/**
 * Drives the Market-Wide Build Opportunities scan (issue #819) as an
 * explicit, opt-in action — unlike `useOpportunities`, this never fetches on
 * mount: the ticket calls out that a market-wide sweep must never run just
 * because the tab was visited.
 */
import { useCallback, useRef, useState } from 'react';
import type { BlueprintSource } from '@/engine/industry/blueprintObtainability';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { TradeHub } from '@/market/hubs';
import type { MarketWideTreeMap } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import { loadBlueprintSourceSets } from './blueprintSourceSets';
import {
  runMarketWideScan,
  type MarketWideResultRow,
  type MarketWideScanOptions,
} from './marketWideOpportunities';

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
  options?: MarketWideScanOptions;
}

export interface UseMarketWideOpportunitiesResult {
  rows: MarketWideResultRow[];
  loading: boolean;
  /** True once a scan has completed at least once — distinguishes "never run" from "ran, found nothing". */
  hasRun: boolean;
  error: boolean;
  /** Blueprint sources the last scan couldn't read — rows needing one may be missing. */
  unavailableSources: BlueprintSource[];
  run: () => void;
}

export function useMarketWideOpportunities({
  hub,
  trees,
  catalog,
  modifiers,
  standing,
  characterIds,
  options,
}: UseMarketWideOpportunitiesArgs): UseMarketWideOpportunitiesResult {
  const [state, setState] = useState<{
    rows: MarketWideResultRow[];
    loading: boolean;
    hasRun: boolean;
    error: boolean;
    unavailableSources: BlueprintSource[];
  }>({ rows: [], loading: false, hasRun: false, error: false, unavailableSources: [] });

  // Guards against a stale scan's result landing after a newer one started
  // (e.g. the pilot hits "Scan" twice in a row).
  const runToken = useRef(0);

  const run = useCallback(() => {
    if (!trees || !catalog) return;
    const token = ++runToken.current;
    setState((prev) => ({ ...prev, loading: true, error: false }));
    const blueprints = Object.entries(trees).map(([productTypeID, tree]) => ({
      blueprintTypeID: tree.blueprintTypeID,
      productTypeID: Number(productTypeID),
    }));
    const sources = loadBlueprintSourceSets(characterIds, blueprints);
    const sets = sources.then((loaded) => loaded.sets);
    void Promise.all([
      runMarketWideScan(hub, trees, catalog, modifiers, sets, options, standing),
      sources,
    ])
      .then(([rows, loaded]) => {
        if (runToken.current !== token) return;
        setState({
          rows,
          loading: false,
          hasRun: true,
          error: false,
          unavailableSources: loaded.unavailable,
        });
      })
      .catch(() => {
        if (runToken.current !== token) return;
        setState({ rows: [], loading: false, hasRun: true, error: true, unavailableSources: [] });
      });
  }, [hub, trees, catalog, modifiers, options, standing, characterIds]);

  return { ...state, run };
}
