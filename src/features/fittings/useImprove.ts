/**
 * Improve for the open Fitting (`findImprovements`): every fitted module's
 * variations the hull takes and the pilot can fly, recalculated whole under
 * the same evaluator the page's stats come from (Damage Profile, Overheat
 * all, implant basis), scored against the page's Target Profile and priced
 * at the pilot's Trade Hub. Runs only while `enabled`, so a closed drawer
 * costs nothing; Cancel aborts the calculation in the worker.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  findImprovements,
  goalAvailability,
  IMPROVE_MODES,
  IMPROVE_REACHES,
  improveCandidates,
  MAX_CANDIDATES,
  type DefenseChoice,
  type ImproveCandidate,
  type ImproveGoal,
  type ImproveMode,
  type ImproveReach,
  type ImproveResult,
  type ModulePool,
} from '@/engine/fittings/improve';
import { TANK_GOALS } from '@/engine/fittings/improveGroups';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { FittingStats } from '@/engine/fittings/types';
import { buildVariationIndex } from '@/engine/market/variations';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadFittingPrice } from './fittingPrice';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';
import { COMBAT_GOALS } from '@/engine/fittings/improve';

/** The last Improve Goal, remembered on this device like other Fittings preferences. */
export const useImproveGoal = createLocalSetting<ImproveGoal>({
  key: 'fittingsImproveGoal',
  defaultValue: 'overall',
  parse: (raw) =>
    typeof raw === 'string' && (COMBAT_GOALS as readonly string[]).includes(raw)
      ? (raw as ImproveGoal)
      : 'overall',
});

/** How far Improve goes from the fitted modules, remembered on this device. */
export const useImproveReach = createLocalSetting<ImproveReach>({
  key: 'fittingsImproveReach',
  defaultValue: 'upgrade',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_REACHES as readonly string[]).includes(raw)
      ? (raw as ImproveReach)
      : 'upgrade',
});

/** Planning to buy or Refitting a ship the pilot owns, remembered on this device. */
export const useImproveMode = createLocalSetting<ImproveMode>({
  key: 'fittingsImproveMode',
  defaultValue: 'buy',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_MODES as readonly string[]).includes(raw)
      ? (raw as ImproveMode)
      : 'buy',
});

/** The total budget (planning) or extra-spend cap (refitting) in ISK; null is no limit. */
export const useImproveSpendCap = createLocalSetting<number | null>({
  key: 'fittingsImproveSpendCap',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null),
});

/** What the drawer asks of one search beyond the goal. */
export interface ImproveConfig {
  reach: ImproveReach;
  mode: ImproveMode;
  spendCap: number | null;
  defense: DefenseChoice;
  includeRigs: boolean;
  includeOfficer: boolean;
}

/** After this long a search offers "Show best so far". */
export const BEST_SO_FAR_AFTER_MS = 10_000;

export type ImproveState =
  | { status: 'idle' }
  | { status: 'searching'; checked: number; total: number; slow: boolean }
  | { status: 'cancelled' }
  | { status: 'failed' }
  | {
      status: 'done';
      result: ImproveResult;
      before: FittingStats;
      elapsedMs: number;
      /** A tank goal under Shield or Armor: both sides' results, to compare. */
      sides?: Record<'shield' | 'armor', ImproveResult>;
    };

export interface ImproveSearch {
  /** The goal searched: the remembered one, or Best overall when this fit cannot score it. */
  goal: ImproveGoal;
  state: ImproveState;
  /** The open Fitting's stats before any swap, for each row's goal check; null until known. */
  before: FittingStats | null;
  cancel: () => void;
  showBestSoFar: () => void;
  /** Runs the search again after a Cancel. */
  restart: () => void;
}

/** The module pool the catalogue gives Rework and the fills: group, group members, market-listed. */
function modulePool(catalogue: FittingCatalogue): ModulePool {
  const listed = new Set(catalogue.marketTypes.map((entry) => entry.typeId));
  return {
    groupOf: (typeId) => catalogue.types[String(typeId)]?.groupID,
    typeIdsInGroup: (groupId) => catalogue.typeIdsByGroup.get(groupId) ?? [],
    published: (typeId) => listed.has(typeId),
  };
}

/** Candidates the hull takes and the pilot can fly: one the pilot lacks skills for goes under Train instead. */
function flyableCandidates(
  variants: VariantEvaluator,
  catalogue: FittingCatalogue,
  goal: ImproveGoal,
  defense: DefenseChoice,
  config: ImproveConfig,
  slotCounts: FittingStats['slotCounts']
): ImproveCandidate[] {
  const index = buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups);
  const all = improveCandidates(variants.fitting.modules, index, catalogue.rackOf, {
    goal,
    reach: config.reach,
    defense,
    includeRigs: config.includeRigs,
    includeOfficer: config.includeOfficer,
    slotCounts,
    pool: modulePool(catalogue),
    limit: Infinity,
  });
  const bySlot = new Map<ImproveCandidate['at'][number]['slot'], number[]>();
  for (const candidate of all) {
    const slot = candidate.at[0].slot;
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), candidate.toTypeId]);
  }
  const checks = new Map(
    [...bySlot].map(([slot, typeIds]) => [
      slot,
      variants.engine.checkCandidates(variants.fitting.shipTypeId, slot, typeIds, variants.profile),
    ])
  );
  return all
    .filter((candidate) => {
      const check = checks.get(candidate.at[0].slot)?.get(candidate.toTypeId);
      return check ? check.fitsHull && check.canFly : true;
    })
    .slice(0, MAX_CANDIDATES);
}

/** Every type id a candidate (and the downgrade paired with it) buys or sells. */
function candidateTypeIds(candidates: readonly ImproveCandidate[]): number[] {
  const ids = new Set<number>();
  const add = (candidate: ImproveCandidate | undefined) => {
    if (!candidate) return;
    ids.add(candidate.toTypeId);
    if (candidate.fromTypeId !== null) ids.add(candidate.fromTypeId);
    add(candidate.pairedWith);
  };
  candidates.forEach(add);
  return [...ids];
}

export function useImprove(
  variants: VariantEvaluator | null,
  catalogue: FittingCatalogue | null,
  goal: ImproveGoal,
  target: TargetProfile | undefined,
  enabled: boolean,
  config: ImproveConfig
): ImproveSearch {
  const hubId = useMarketHub((state) => state.value);
  const [state, setState] = useState<ImproveState>({ status: 'idle' });
  const [before, setBefore] = useState<FittingStats | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelRef = useRef<() => void>(() => {});
  const stopRef = useRef(false);
  const { reach, mode, spendCap, defense, includeRigs, includeOfficer } = config;

  useEffect(() => {
    if (!enabled || !variants || !catalogue) return;
    let cancelled = false;
    const controller = new AbortController();
    stopRef.current = false;
    cancelRef.current = () => {
      cancelled = true;
      controller.abort();
      setState({ status: 'cancelled' });
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new search starts from nothing
    setState({ status: 'searching', checked: 0, total: 0, slow: false });
    // The last fit's baseline must not decide this fit's goal chips.
    setBefore(null);
    const started = performance.now();
    const slowTimer = setTimeout(() => {
      if (!cancelled)
        setState((current) =>
          current.status === 'searching' ? { ...current, slow: true } : current
        );
    }, BEST_SO_FAR_AFTER_MS);
    void (async () => {
      try {
        const { before: own } = await variants.compare(variants.fitting, controller.signal);
        if (cancelled) return;
        setBefore(own);
        // A remembered goal this fit cannot score (Longer reach on a drone boat) searches Best overall.
        const searched = goalAvailability(goal, own).available ? goal : 'overall';
        // A tank goal under Shield or Armor runs both sides, the chosen one first, to compare them.
        const sides: DefenseChoice[] =
          defense !== 'keep' && TANK_GOALS.has(searched)
            ? [defense, defense === 'shield' ? 'armor' : 'shield']
            : [defense];
        const sets = sides.map((side) => ({
          side,
          candidates: flyableCandidates(
            variants,
            catalogue,
            searched,
            side,
            { reach, mode, spendCap, defense, includeRigs, includeOfficer },
            own.slotCounts
          ),
        }));
        const total = sets.reduce((sum, set) => sum + set.candidates.length, 0);
        setState((current) =>
          current.status === 'searching' ? { ...current, checked: 0, total } : current
        );
        const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
        const typeIds = candidateTypeIds(sets.flatMap((set) => set.candidates));
        const [priceMap, fitTotal] = await Promise.all([
          getHubPrices(hub, typeIds).catch(() => null),
          // The Price section's own total, for Planning's budget.
          mode === 'buy' && spendCap !== null
            ? loadFittingPrice(variants.fitting, hub)
                .then((price) => price.totals.sell)
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const results: ImproveResult[] = [];
        let done = 0;
        for (const set of sets) {
          const result = await findImprovements({
            fitting: variants.fitting,
            before: own,
            goal: searched,
            candidates: set.candidates,
            stats: async (fitting) => (await variants.compare(fitting, controller.signal)).after,
            priceOf: (typeId) => priceMap?.get(typeId)?.sellMin ?? null,
            ...(target ? { target } : {}),
            mode,
            spendCap,
            fitTotal,
            onProgress: (checked) => {
              if (!cancelled)
                setState((current) =>
                  current.status === 'searching'
                    ? { ...current, checked: done + checked, total }
                    : current
                );
            },
            isCancelled: () => cancelled,
            shouldStop: () => stopRef.current,
          });
          if (cancelled || result === null) return;
          results.push(result);
          done += set.candidates.length;
        }
        const sideResults =
          sets.length === 2
            ? ({
                [sets[0].side]: results[0],
                [sets[1].side]: results[1],
              } as Record<'shield' | 'armor', ImproveResult>)
            : undefined;
        setState({
          status: 'done',
          result: results[0],
          before: own,
          elapsedMs: performance.now() - started,
          ...(sideResults ? { sides: sideResults } : {}),
        });
      } catch {
        if (!cancelled) setState({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(slowTimer);
    };
  }, [
    enabled,
    variants,
    catalogue,
    goal,
    target,
    hubId,
    attempt,
    reach,
    mode,
    spendCap,
    defense,
    includeRigs,
    includeOfficer,
  ]);

  const cancel = useCallback(() => cancelRef.current(), []);
  const showBestSoFar = useCallback(() => {
    stopRef.current = true;
  }, []);
  const restart = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    goal: before && !goalAvailability(goal, before).available ? 'overall' : goal,
    state: enabled ? state : { status: 'idle' },
    before: enabled ? before : null,
    cancel,
    showBestSoFar,
    restart,
  };
}
