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
 * `candidatesRef` lets the effect depend on `batchKey` (built from candidate ids,
 * not array identity) so a re-render that hands in a freshly-computed but
 * content-identical `candidates` array does not restart the fetch.
 *
 * Above `AUTO_RECALCULATE_MAX` owned blueprints, a remount (switching tabs
 * away and back) must not silently recompute — the ticket calls that out as
 * a manual-refresh action. Nor may it serve rows priced at since-changed
 * inputs (issue #2056); see `decideOpportunitiesCache`. `rowsCache` is
 * module-level (outside React state) so it survives the panel unmounting when the tab changes, the same way
 * `marketData.ts`'s cost-index cache survives a remount. `rows`/`progress`/
 * `loading` live in one state object (rather than three separate `useState`
 * calls) so every branch below is exactly one `setState` call, matching this
 * codebase's `react-hooks/set-state-in-effect` rule.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { PiData } from '@/sde/types';
import type { TradeHub } from '@/market/hubs';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import type { BlueprintCatalog } from './blueprintCatalog';
import { loadMarketSnapshots } from './marketData';
import { recipeForLookup } from './recipes';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import {
  autoRecalculates,
  computeOpportunityRow,
  decideOpportunitiesCache,
  deleteOpportunitiesCache,
  detectOpportunityStock,
  opportunitiesBatchKey,
  opportunitiesInputsKey,
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
  facilityDefaults: ActivityFacilityDefaults;
  modifiers: CharacterModifiers;
  ownedStockSnapshot: OwnedStockSnapshot;
  /** Every owned blueprint by character, so a sub-build the recursive engine prices quotes at a researched copy's real ME where the pilot owns one. */
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>;
  /** ME to quote a sub-build at when the pilot owns no copy of its blueprint — same preference `BuildPlanDetail.tsx` uses. */
  assumedMe: number;
}

export interface UseOpportunitiesResult {
  rows: OpportunityRow[];
  loading: boolean;
  progress: { done: number; total: number };
  /** True once the batch exceeds the auto-recalculate threshold — the panel shows a manual Refresh action instead of silently recomputing on every visit. */
  manualRefreshOnly: boolean;
  /** True when the cached large batch was priced at since-changed inputs: no rows are shown until the pilot hits Refresh. */
  needsRefresh: boolean;
  refresh: () => void;
}

interface OpportunitiesState {
  rows: OpportunityRow[];
  progress: { done: number; total: number };
  loading: boolean;
  needsRefresh: boolean;
}

const EMPTY_STATE: OpportunitiesState = {
  rows: [],
  progress: { done: 0, total: 0 },
  loading: false,
  needsRefresh: false,
};

export function useOpportunities({
  candidates,
  catalog,
  pi,
  hub,
  facilityDefaults,
  modifiers,
  ownedStockSnapshot,
  ownedByCharacter,
  assumedMe,
}: UseOpportunitiesArgs): UseOpportunitiesResult {
  const [state, setState] = useState<OpportunitiesState>(EMPTY_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  const candidatesRef = useRef(candidates);
  useEffect(() => {
    candidatesRef.current = candidates;
  });

  const manualRefreshOnly = !autoRecalculates(candidates.length);
  const batchKey = useMemo(() => opportunitiesBatchKey(candidates, hub), [candidates, hub]);
  const inputsKey = useMemo(
    () => opportunitiesInputsKey({ assumedMe, modifiers, facilityDefaults, ownedByCharacter }),
    [assumedMe, modifiers, facilityDefaults, ownedByCharacter]
  );

  useEffect(() => {
    const currentCandidates = candidatesRef.current;
    if (currentCandidates.length === 0 || !catalog) {
      setState(EMPTY_STATE);
      return;
    }

    const decision = decideOpportunitiesCache(
      readOpportunitiesCache(batchKey),
      inputsKey,
      manualRefreshOnly
    );
    if (decision.kind === 'serve') {
      // Serves the module-level cache verbatim — a remount (tab switch away
      // and back) must land here without ever entering the loading/fetch
      // path below, which is exactly what "does not auto-recalculate above
      // the threshold" means.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        ...EMPTY_STATE,
        rows: decision.rows,
        progress: { done: decision.rows.length, total: decision.rows.length },
      });
      return;
    }
    if (decision.kind === 'needs-refresh') {
      setState({ ...EMPTY_STATE, needsRefresh: true });
      return;
    }

    let cancelled = false;
    setState({
      ...EMPTY_STATE,
      progress: { done: 0, total: currentCandidates.length },
      loading: true,
    });

    void (async () => {
      const request = opportunitySnapshotRequest(currentCandidates, hub, catalog, pi);
      const snapshot = await loadMarketSnapshots([request])[0]!;
      if (cancelled) return;

      const stock = detectOpportunityStock(ownedStockSnapshot.sources, currentCandidates);
      const unranked: UnrankedOpportunityRow[] = [];

      for (let i = 0; i < currentCandidates.length; i += CHUNK_SIZE) {
        if (cancelled) return;
        for (const candidate of currentCandidates.slice(i, i + CHUNK_SIZE)) {
          const recipeFor = recipeForLookup({
            catalog,
            pi,
            ownedBlueprints: ownedByCharacter.get(candidate.characterId) ?? [],
            assumedMeForUnowned: assumedMe,
          });
          const row = computeOpportunityRow(
            candidate,
            snapshot,
            facilityDefaults,
            modifiers,
            stock,
            {
              recipeFor,
              // Build Opportunities' own auto-build depth control was
              // removed as unused (issue #652 superseded) — every row now
              // prices with nothing auto-built, `computeOpportunityRow`'s
              // own pre-#652 plain behavior.
              depth: 0,
            }
          );
          if (row) unranked.push(row);
        }
        const done = Math.min(i + CHUNK_SIZE, currentCandidates.length);
        setState({
          ...EMPTY_STATE,
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
      writeOpportunitiesCache(batchKey, { inputsKey, rows: ranked });
      setState({
        ...EMPTY_STATE,
        rows: ranked,
        progress: { done: ranked.length, total: currentCandidates.length },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    batchKey,
    inputsKey,
    catalog,
    pi,
    hub,
    facilityDefaults,
    modifiers,
    ownedStockSnapshot,
    ownedByCharacter,
    assumedMe,
    refreshToken,
    manualRefreshOnly,
  ]);

  // Dropping the entry is what makes the next run compute; the token only
  // re-runs the effect.
  const refresh = useCallback(() => {
    deleteOpportunitiesCache(batchKey);
    setRefreshToken((t) => t + 1);
  }, [batchKey]);

  return { ...state, manualRefreshOnly, refresh };
}
