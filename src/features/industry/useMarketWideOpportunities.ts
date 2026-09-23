/**
 * Drives the Market-Wide Build Opportunities scan (issue #819) as an
 * explicit, opt-in action — unlike `useOpportunities`, this never fetches on
 * mount: the ticket calls out that a market-wide sweep must never run just
 * because the tab was visited.
 */
import { useCallback, useRef, useState } from 'react';
import type { SkillLevels } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { TradeHub } from '@/market/hubs';
import type { MarketWideTreeMap } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
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
  skills: SkillLevels;
  /** The character's standing toward `hub`'s NPC owner (issue #1238). Absent/0 = standings assumed 0. */
  standing?: ResolvedStandings;
  options?: MarketWideScanOptions;
}

export interface UseMarketWideOpportunitiesResult {
  rows: MarketWideResultRow[];
  loading: boolean;
  /** True once a scan has completed at least once — distinguishes "never run" from "ran, found nothing". */
  hasRun: boolean;
  error: boolean;
  run: () => void;
}

export function useMarketWideOpportunities({
  hub,
  trees,
  catalog,
  skills,
  standing,
  options,
}: UseMarketWideOpportunitiesArgs): UseMarketWideOpportunitiesResult {
  const [state, setState] = useState<{
    rows: MarketWideResultRow[];
    loading: boolean;
    hasRun: boolean;
    error: boolean;
  }>({ rows: [], loading: false, hasRun: false, error: false });

  // Guards against a stale scan's result landing after a newer one started
  // (e.g. the pilot hits "Scan" twice in a row).
  const runToken = useRef(0);

  const run = useCallback(() => {
    if (!trees || !catalog) return;
    const token = ++runToken.current;
    setState((prev) => ({ ...prev, loading: true, error: false }));
    void runMarketWideScan(hub, trees, catalog, skills, options, standing)
      .then((rows) => {
        if (runToken.current !== token) return;
        setState({ rows, loading: false, hasRun: true, error: false });
      })
      .catch(() => {
        if (runToken.current !== token) return;
        setState({ rows: [], loading: false, hasRun: true, error: true });
      });
  }, [hub, trees, catalog, skills, options, standing]);

  return { ...state, run };
}
