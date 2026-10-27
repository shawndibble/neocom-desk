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
import type { BuildPlanRecord } from '@/db';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NO_CHARACTER_MODIFIERS,
  type CharacterModifiers,
} from '@/engine/industry/characterModifiers';
import type { PiData } from '@/sde/types';
import type { TradeHub } from '@/market/hubs';
import type { CharacterBlueprint } from '@/esi/endpoints';
import {
  tradeHubStanding,
  type TradeHubStandingsMap,
} from '@/features/market/useTradeHubStandings';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import type { BlueprintCatalog } from './blueprintCatalog';
import { loadMarketSnapshots } from './marketData';
import { recipeForLookup } from './recipes';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { throttledRanker } from './throttledRanking';
import {
  autoRecalculates,
  computeOpportunityRow,
  decideOpportunitiesCache,
  deleteOpportunitiesCache,
  detectOpportunityStock,
  groupCandidatesByHub,
  latestPlanOf,
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
import { YIELD_BUDGET_MS, yieldToMain } from './yieldToMain';

/** How often a progress frame re-ranks the rows found so far (`throttledRanker`). */
const PROGRESS_RANK_INTERVAL_MS = 500;

export interface UseOpportunitiesArgs {
  candidates: readonly OpportunityCandidate[];
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  /** The Trade Hub each candidate's owning Character would price at (issue #2055) — `hubForCharacter`'s resolution, not a hard-coded default. */
  hubForCharacter: (characterId: number) => TradeHub;
  /** Each candidate's owning Character's latest plan — the price basis and build location a new plan starts from, which rows price with so they use the plan page's settings. */
  defaultsForCharacter: (characterId: number) => BuildPlanRecord | null;
  facilityDefaults: ActivityFacilityDefaults;
  /** Each candidate's owning Character's own skills/implants (issue #2055) — absent reads as `NO_CHARACTER_MODIFIERS`. */
  modifiersByCharacter: ReadonlyMap<number, CharacterModifiers>;
  /** Each candidate's owning Character's own standing toward every Trade Hub (issue #2055) — absent reads as zero. */
  standingsByCharacter: ReadonlyMap<number, TradeHubStandingsMap>;
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
  hubForCharacter,
  defaultsForCharacter,
  facilityDefaults,
  modifiersByCharacter,
  standingsByCharacter,
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
  // The last fully-ranked rows and the batch they price (issue #4918). A
  // recompute of the same batch (late modifiers/prices, background
  // revalidation) keeps showing them until it finishes, rather than blanking
  // the list: a blank unmounts every row, so a Compare tick made then lands on
  // a gone checkbox and the Compare bar vanishes.
  const settledRef = useRef<{ batchKey: string; rows: OpportunityRow[] } | null>(null);

  const manualRefreshOnly = !autoRecalculates(candidates.length);
  const batchKey = useMemo(
    () => opportunitiesBatchKey(candidates, hubForCharacter),
    [candidates, hubForCharacter]
  );
  const inputsKey = useMemo(
    () =>
      opportunitiesInputsKey({
        assumedMe,
        modifiersByCharacter,
        standingsByCharacter,
        facilityDefaults,
        ownedByCharacter,
        defaultsByCharacter: new Map(
          candidates.map((c) => [c.characterId, defaultsForCharacter(c.characterId)] as const)
        ),
      }),
    [
      assumedMe,
      modifiersByCharacter,
      standingsByCharacter,
      facilityDefaults,
      ownedByCharacter,
      candidates,
      defaultsForCharacter,
    ]
  );

  useEffect(() => {
    const currentCandidates = candidatesRef.current;
    if (currentCandidates.length === 0 || !catalog) {
      settledRef.current = null;
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
      settledRef.current = { batchKey, rows: decision.rows };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        ...EMPTY_STATE,
        rows: decision.rows,
        progress: { done: decision.rows.length, total: decision.rows.length },
      });
      return;
    }
    if (decision.kind === 'needs-refresh') {
      // Rows priced at since-changed inputs are never shown (issue #2056),
      // not even while the Refresh that follows computes.
      settledRef.current = null;
      setState({ ...EMPTY_STATE, needsRefresh: true });
      return;
    }

    let cancelled = false;
    // Another batch's rows (a different Character filter or hub) are not
    // these blueprints, so only the same batch's rows carry over.
    const keptRows = settledRef.current?.batchKey === batchKey ? settledRef.current.rows : null;
    setState({
      ...EMPTY_STATE,
      rows: keptRows ?? [],
      progress: { done: 0, total: currentCandidates.length },
      loading: true,
    });

    void (async () => {
      // Grouped by hub (issue #2055's "batched per Character/hub, not per
      // row"): one snapshot request per distinct hub the batch's owning
      // Characters resolve to, not one shared hard-coded default.
      const hubGroups = groupCandidatesByHub(currentCandidates, hubForCharacter);
      const requests = hubGroups.map((group) =>
        opportunitySnapshotRequest(
          group.candidates,
          group.hub,
          catalog,
          pi,
          facilityDefaults,
          latestPlanOf(group.candidates.map((c) => defaultsForCharacter(c.characterId)))
        )
      );
      const snapshots = await Promise.all(loadMarketSnapshots(requests));
      if (cancelled) return;
      const snapshotByHubId = new Map(
        hubGroups.map((group, i) => [group.hub.id, snapshots[i]!] as const)
      );

      const stock = detectOpportunityStock(ownedStockSnapshot.sources, currentCandidates);
      const unranked: UnrankedOpportunityRow[] = [];
      const rankProgress = throttledRanker(rankOpportunityRows, PROGRESS_RANK_INTERVAL_MS);

      let sliceStart = performance.now();
      for (let i = 0; i < currentCandidates.length; i++) {
        if (cancelled) return;
        {
          const candidate = currentCandidates[i]!;
          const recipeFor = recipeForLookup({
            catalog,
            pi,
            ownedBlueprints: ownedByCharacter.get(candidate.characterId) ?? [],
            assumedMeForUnowned: assumedMe,
          });
          const hub = hubForCharacter(candidate.characterId);
          const row = computeOpportunityRow(
            candidate,
            snapshotByHubId.get(hub.id)!,
            facilityDefaults,
            modifiersByCharacter.get(candidate.characterId) ?? NO_CHARACTER_MODIFIERS,
            stock,
            {
              recipeFor,
              // Build Opportunities' own auto-build depth control was
              // removed as unused (issue #652 superseded) — every row now
              // prices with nothing auto-built, `computeOpportunityRow`'s
              // own pre-#652 plain behavior.
              depth: 0,
            },
            hub,
            tradeHubStanding(standingsByCharacter.get(candidate.characterId) ?? new Map(), hub.id),
            defaultsForCharacter(candidate.characterId)
          );
          if (row) unranked.push(row);
        }
        const done = i + 1;
        // Yield on elapsed time, not item count: a progress frame and a turn
        // of the event loop once the time budget is spent.
        if (done < currentCandidates.length && performance.now() - sliceStart < YIELD_BUDGET_MS) {
          continue;
        }
        setState({
          ...EMPTY_STATE,
          rows: keptRows ?? rankProgress(unranked),
          progress: { done, total: currentCandidates.length },
          loading: true,
        });
        if (done < currentCandidates.length) {
          await yieldToMain();
          sliceStart = performance.now();
        }
      }
      if (cancelled) return;
      const ranked = rankOpportunityRows(unranked);
      writeOpportunitiesCache(batchKey, { inputsKey, rows: ranked });
      settledRef.current = { batchKey, rows: ranked };
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
    hubForCharacter,
    defaultsForCharacter,
    facilityDefaults,
    modifiersByCharacter,
    standingsByCharacter,
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
