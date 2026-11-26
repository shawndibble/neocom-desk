import type { BuildPlanRecord } from '@/db';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import { startingLocation } from './newBuildPlan';
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
  isReaction,
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

const PROGRESS_RANK_INTERVAL_MS = 500;

export interface UseOpportunitiesArgs {
  candidates: readonly OpportunityCandidate[];
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  hubForCharacter: (characterId: number) => TradeHub;
  defaultsForCharacter: (characterId: number) => BuildPlanRecord | null;
  facilityDefaults: ActivityFacilityDefaults;
  modifiersByCharacter: ReadonlyMap<number, CharacterModifiers>;
  standingsByCharacter: ReadonlyMap<number, TradeHubStandingsMap>;
  ownedStockSnapshot: OwnedStockSnapshot;
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>;
  assumedMe: number;
  profitBasis: ProfitBasis;
  pricePercent?: number;
}

export interface UseOpportunitiesResult {
  rows: OpportunityRow[];
  loading: boolean;
  progress: { done: number; total: number };
  manualRefreshOnly: boolean;
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
  profitBasis,
  pricePercent,
}: UseOpportunitiesArgs): UseOpportunitiesResult {
  const [state, setState] = useState<OpportunitiesState>(EMPTY_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  const defaultsRef = useRef(defaultsForCharacter);
  useEffect(() => {
    defaultsRef.current = defaultsForCharacter;
  });
  const candidatesRef = useRef(candidates);
  useEffect(() => {
    candidatesRef.current = candidates;
  });
  const settledRef = useRef<{ batchKey: string; rows: OpportunityRow[] } | null>(null);

  const manualRefreshOnly = !autoRecalculates(candidates.length);
  const batchKey = useMemo(
    () =>
      pricePercent === undefined
        ? opportunitiesBatchKey(candidates, hubForCharacter)
        : `${opportunitiesBatchKey(candidates, hubForCharacter)}|${pricePercent}%`,
    [candidates, hubForCharacter, pricePercent]
  );
  const inputsKey = useMemo(
    () =>
      opportunitiesInputsKey({
        assumedMe,
        profitBasis,
        modifiersByCharacter,
        standingsByCharacter,
        facilityDefaults,
        ownedByCharacter,
        defaultsByCharacter: new Map(
          candidates.map((c) => [c.characterId, defaultsForCharacter(c.characterId)] as const)
        ),
        pricesReactions: candidates.some(isReaction),
      }),
    [
      assumedMe,
      profitBasis,
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
      settledRef.current = null;
      setState({ ...EMPTY_STATE, needsRefresh: true });
      return;
    }

    let cancelled = false;
    const keptRows = settledRef.current?.batchKey === batchKey ? settledRef.current.rows : null;
    setState({
      ...EMPTY_STATE,
      rows: keptRows ?? [],
      progress: { done: 0, total: currentCandidates.length },
      loading: true,
    });

    void (async () => {
      const hubGroups = groupCandidatesByHub(
        currentCandidates,
        hubForCharacter,
        (characterId, activity) =>
          startingLocation(activity, facilityDefaults, defaultsRef.current(characterId))
            .buildSystemId
      );
      const requests = hubGroups.map((group) => ({
        ...opportunitySnapshotRequest(
          group.candidates,
          group.hub,
          catalog,
          pi,
          facilityDefaults,
          defaultsRef.current(group.candidates[0]!.characterId),
          group.activity
        ),
        pricePercent,
      }));
      const snapshots = await Promise.all(loadMarketSnapshots(requests));
      if (cancelled) return;
      const snapshotByCandidateId = new Map(
        hubGroups.flatMap((group, i) =>
          group.candidates.map((candidate) => [candidate.id, snapshots[i]!] as const)
        )
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
            snapshotByCandidateId.get(candidate.id)!,
            facilityDefaults,
            modifiersByCharacter.get(candidate.characterId) ?? NO_CHARACTER_MODIFIERS,
            stock,
            {
              recipeFor,
              depth: 0,
            },
            hub,
            tradeHubStanding(standingsByCharacter.get(candidate.characterId) ?? new Map(), hub.id),
            defaultsRef.current(candidate.characterId),
            profitBasis
          );
          if (row) unranked.push(row);
        }
        const done = i + 1;
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
    facilityDefaults,
    modifiersByCharacter,
    standingsByCharacter,
    ownedStockSnapshot,
    ownedByCharacter,
    assumedMe,
    profitBasis,
    pricePercent,
    refreshToken,
    manualRefreshOnly,
  ]);

  const refresh = useCallback(() => {
    deleteOpportunitiesCache(batchKey);
    setRefreshToken((t) => t + 1);
  }, [batchKey]);

  return { ...state, manualRefreshOnly, refresh };
}
