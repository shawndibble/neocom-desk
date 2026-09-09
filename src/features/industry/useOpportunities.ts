/**
 * Drives Build Opportunities' incremental compute (issue #642): one shared,
 * batched market-snapshot fetch (`opportunitySnapshotRequest`), then each
 * candidate priced in small chunks with a `setTimeout(0)` yield between them
 * so the progress counter and rows actually paint incrementally rather than
 * the whole list landing in one frame — dozens of pure `buildVsBuy` calls are
 * fast individually, but running all of them synchronously would still block
 * the one frame they land in.
 *
 * Mirrors `useComparedBuildResults.ts`'s latest-ref + value-stable-key shape:
 * `candidatesRef` lets the effect depend on `key` (built from candidate ids,
 * not array identity) so a re-render that hands in a freshly-computed but
 * content-identical `candidates` array does not restart the fetch.
 *
 * Above `AUTO_RECALCULATE_MAX` owned blueprints, a remount (switching tabs
 * away and back) must not silently recompute — the ticket calls that out as
 * a manual-refresh action. `rowsCache` is module-level (outside React state)
 * so it survives the panel unmounting when the tab changes, the same way
 * `marketData.ts`'s cost-index cache survives a remount. `rows`/`progress`/
 * `loading` live in one state object (rather than three separate `useState`
 * calls) so every branch below is exactly one `setState` call, matching this
 * codebase's `react-hooks/set-state-in-effect` rule.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SkillLevels } from '@/engine/industry/types';
import type { PiData } from '@/sde/types';
import type { TradeHub } from '@/market/hubs';
import type { FacilityDefaults } from './facilityDefaults';
import type { BlueprintCatalog } from './blueprintCatalog';
import { loadMarketSnapshots } from './marketData';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import {
  autoRecalculates,
  computeOpportunityRow,
  detectOpportunityStock,
  opportunitiesCacheKey,
  opportunitySnapshotRequest,
  rankOpportunityRows,
  readOpportunitiesCache,
  writeOpportunitiesCache,
  type OpportunityCandidate,
  type OpportunityRow,
  type UnrankedOpportunityRow,
} from './opportunities';

const CHUNK_SIZE = 5;

export interface UseOpportunitiesArgs {
  candidates: readonly OpportunityCandidate[];
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  hub: TradeHub;
  facilityDefaults: FacilityDefaults;
  skills: SkillLevels;
  ownedStockSnapshot: OwnedStockSnapshot;
}

export interface UseOpportunitiesResult {
  rows: OpportunityRow[];
  loading: boolean;
  progress: { done: number; total: number };
  /** True once the batch exceeds the auto-recalculate threshold — the panel shows a manual Refresh action instead of silently recomputing on every visit. */
  manualRefreshOnly: boolean;
  refresh: () => void;
}

interface OpportunitiesState {
  rows: OpportunityRow[];
  progress: { done: number; total: number };
  loading: boolean;
}

const EMPTY_STATE: OpportunitiesState = {
  rows: [],
  progress: { done: 0, total: 0 },
  loading: false,
};

export function useOpportunities({
  candidates,
  catalog,
  pi,
  hub,
  facilityDefaults,
  skills,
  ownedStockSnapshot,
}: UseOpportunitiesArgs): UseOpportunitiesResult {
  const [state, setState] = useState<OpportunitiesState>(EMPTY_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  const candidatesRef = useRef(candidates);
  useEffect(() => {
    candidatesRef.current = candidates;
  });

  const manualRefreshOnly = !autoRecalculates(candidates.length);
  const key = useMemo(() => opportunitiesCacheKey(candidates, hub), [candidates, hub]);

  useEffect(() => {
    const currentCandidates = candidatesRef.current;
    if (currentCandidates.length === 0 || !catalog) {
      setState(EMPTY_STATE);
      return;
    }

    // A cached batch is only reused above the auto-recalculate threshold,
    // and only until the pilot explicitly hits Refresh (refreshToken > 0)
    // — below the threshold this always recomputes, matching "recalculates
    // automatically" for a small owned-blueprint count.
    const cached = readOpportunitiesCache(key);
    if (cached && manualRefreshOnly && refreshToken === 0) {
      // Serves the module-level cache verbatim — a remount (tab switch away
      // and back) must land here without ever entering the loading/fetch
      // path below, which is exactly what "does not auto-recalculate above
      // the threshold" means.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        rows: cached,
        progress: { done: cached.length, total: cached.length },
        loading: false,
      });
      return;
    }

    let cancelled = false;
    setState({ rows: [], progress: { done: 0, total: currentCandidates.length }, loading: true });

    void (async () => {
      const request = opportunitySnapshotRequest(currentCandidates, hub, catalog, pi);
      const snapshot = await loadMarketSnapshots([request])[0]!;
      if (cancelled) return;

      const stock = detectOpportunityStock(ownedStockSnapshot.sources, currentCandidates);
      const unranked: UnrankedOpportunityRow[] = [];

      for (let i = 0; i < currentCandidates.length; i += CHUNK_SIZE) {
        if (cancelled) return;
        for (const candidate of currentCandidates.slice(i, i + CHUNK_SIZE)) {
          const row = computeOpportunityRow(candidate, snapshot, facilityDefaults, skills, stock);
          if (row) unranked.push(row);
        }
        const done = Math.min(i + CHUNK_SIZE, currentCandidates.length);
        setState({
          rows: rankOpportunityRows(unranked),
          progress: { done, total: currentCandidates.length },
          loading: true,
        });
        if (done < currentCandidates.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      if (cancelled) return;
      const ranked = rankOpportunityRows(unranked);
      writeOpportunitiesCache(key, ranked);
      setState({
        rows: ranked,
        progress: { done: ranked.length, total: currentCandidates.length },
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    key,
    catalog,
    pi,
    hub,
    facilityDefaults,
    skills,
    ownedStockSnapshot,
    refreshToken,
    manualRefreshOnly,
  ]);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  return { ...state, manualRefreshOnly, refresh };
}
