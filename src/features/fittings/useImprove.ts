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
  DEFAULT_IMPROVE_HOLD,
  findImprovements,
  goalAvailability,
  heldHold,
  IMPROVE_GOALS,
  IMPROVE_HOLDS,
  IMPROVE_MODES,
  IMPROVE_REACHES,
  improveCandidates,
  type DefenseChoice,
  type ImproveCandidate,
  type ImproveGoal,
  type ImproveHold,
  type ImproveMode,
  type ImproveReach,
  type ImproveResult,
  type ModulePool,
} from '@/engine/fittings/improve';
import { overBudgetResources } from '@/engine/fittings/improveFree';
import {
  bestCrystalKey,
  crystalKeyOf,
  crystalsOfFamily,
  loadCrystals,
} from '@/engine/fittings/improveMining';
import { CRYSTAL_FAMILY_ORES } from '@/engine/fittings/crystalChoice';
import { TANK_GOALS } from '@/engine/fittings/improveGroups';
import type { Resource } from '@/engine/fittings/makeItFit';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import { buildVariationIndex } from '@/engine/market/variations';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadFittingPrice } from './fittingPrice';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';

/** The last Improve Goal, remembered on this device like other Fittings preferences. */
export const useImproveGoal = createLocalSetting<ImproveGoal>({
  key: 'fittingsImproveGoal',
  defaultValue: 'overall',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_GOALS as readonly string[]).includes(raw)
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

/** The ore Mine more scores, as its crystal family; remembered on this device. */
export const DEFAULT_ORE_FAMILY = 'Simple Asteroid';
export const useImproveOre = createLocalSetting<string>({
  key: 'fittingsImproveOre',
  defaultValue: DEFAULT_ORE_FAMILY,
  parse: (raw) =>
    typeof raw === 'string' && raw in CRYSTAL_FAMILY_ORES ? raw : DEFAULT_ORE_FAMILY,
});

/** The hold Carry more scores; remembered on this device. */
export const useImproveHold = createLocalSetting<ImproveHold>({
  key: 'fittingsImproveHold',
  defaultValue: DEFAULT_IMPROVE_HOLD,
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_HOLDS as readonly string[]).includes(raw)
      ? (raw as ImproveHold)
      : DEFAULT_IMPROVE_HOLD,
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
  /** Mine more: the crystal family (ore) every miner is scored with. */
  oreFamily: string;
  /** Carry more: the hold scored. */
  hold: ImproveHold;
}

/** After this long a search offers "Show best so far". */
export const BEST_SO_FAR_AFTER_MS = 10_000;

export type ImproveState =
  | { status: 'idle' }
  | { status: 'searching'; checked: number; total: number; slow: boolean }
  | { status: 'cancelled' }
  /** The fit is over a budget: Improve hands over to Make it fit and searches nothing. */
  | { status: 'overBudget'; resources: Resource[] }
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

/** The module pool the catalogue gives Rework and the fills: group, group members, market-listed, hull and skills. */
function modulePool(catalogue: FittingCatalogue, variants: VariantEvaluator): ModulePool {
  const listed = new Set(catalogue.marketTypes.map((entry) => entry.typeId));
  const flyable = new Map<string, boolean>();
  return {
    groupOf: (typeId) => catalogue.types[String(typeId)]?.groupID,
    typeIdsInGroup: (groupId) => catalogue.typeIdsByGroup.get(groupId) ?? [],
    published: (typeId) => listed.has(typeId),
    // A module the pilot lacks skills for goes under Train instead.
    flyable: (slot, typeId) => {
      const key = `${slot}:${typeId}`;
      let ok = flyable.get(key);
      if (ok === undefined) {
        const check = variants.engine
          .checkCandidates(variants.fitting.shipTypeId, slot, [typeId], variants.profile)
          .get(typeId);
        ok = check ? check.fitsHull && check.canFly : true;
        flyable.set(key, ok);
      }
      return ok;
    },
  };
}

/** The candidates for one side of the search, the hull takes and the pilot can fly. */
function searchCandidates(
  variants: VariantEvaluator,
  catalogue: FittingCatalogue,
  goal: ImproveGoal,
  config: ImproveConfig,
  slotCounts: FittingStats['slotCounts']
): ImproveCandidate[] {
  const index = buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups);
  return improveCandidates(variants.fitting.modules, index, catalogue.rackOf, {
    goal,
    reach: config.reach,
    defense: config.defense,
    includeRigs: config.includeRigs,
    includeOfficer: config.includeOfficer,
    slotCounts,
    pool: modulePool(catalogue, variants),
  });
}

/**
 * Mine more's ore: which crystal each miner type loads, for `family`. The
 * crystal letter and tech level that mine the most on the open Fitting is
 * used for every miner type, so each row is the one ore's best case. Null
 * when no fitted miner takes a crystal of the family.
 */
async function crystalPlan(
  variants: VariantEvaluator,
  catalogue: FittingCatalogue,
  family: string,
  own: FittingStats,
  signal: AbortSignal
): Promise<((moduleTypeId: number) => number | null) | null> {
  const nameOf = (typeId: number) => catalogue.types[String(typeId)]?.name;
  const known = new Map<number, number[]>();
  const crystalsFor = (typeId: number): number[] => {
    let crystals = known.get(typeId);
    if (!crystals) {
      const slot = catalogue.rackOf[String(typeId)] as FittingSlotKind | undefined;
      const groups = slot
        ? variants.engine.chargeGroupIdsFor(variants.fitting.shipTypeId, slot, typeId)
        : [];
      crystals = crystalsOfFamily(
        family,
        groups.flatMap((group) => catalogue.typeIdsByGroup.get(group) ?? []),
        nameOf
      );
      known.set(typeId, crystals);
    }
    return crystals;
  };
  const keyOf = (crystal: number) => crystalKeyOf(nameOf(crystal) ?? '');
  const forKey = (key: string) => (typeId: number) =>
    crystalsFor(typeId).find((crystal) => keyOf(crystal) === key) ?? null;
  const minerTypes = new Set(
    own.mining.rows.filter((row) => !row.isDrone).map((row) => row.typeId)
  );
  const keys = new Set<string>();
  for (const typeId of minerTypes)
    for (const crystal of crystalsFor(typeId)) {
      const key = keyOf(crystal);
      if (key) keys.add(key);
    }
  const best = await bestCrystalKey([...keys], async (key) => {
    const { after } = await variants.compare(loadCrystals(variants.fitting, forKey(key)), signal);
    return after.mining.perSecond;
  });
  return best === null ? null : forKey(best);
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
  const { reach, mode, spendCap, defense, includeRigs, includeOfficer, oreFamily, hold } = config;

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
        // A fit that doesn't fit has nothing to improve yet (`20261019-144736`).
        const over = overBudgetResources(own);
        if (over.length > 0) {
          setState({ status: 'overBudget', resources: over });
          return;
        }
        // A remembered goal this fit cannot score (Longer reach on a drone boat) searches Best overall.
        const searched = goalAvailability(goal, own).available ? goal : 'overall';
        // A tank goal under Shield or Armor runs both sides, the chosen one first, to compare them.
        const sides: DefenseChoice[] =
          defense !== 'keep' && TANK_GOALS.has(searched)
            ? [defense, defense === 'shield' ? 'armor' : 'shield']
            : [defense];
        const sets = sides.map((side) => ({
          side,
          candidates: searchCandidates(
            variants,
            catalogue,
            searched,
            { reach, mode, spendCap, defense: side, includeRigs, includeOfficer, oreFamily, hold },
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
        // A cap that cannot be checked is not silently waived.
        if (spendCap !== null && (priceMap === null || (mode === 'buy' && fitTotal === null)))
          throw new Error('Prices unavailable for the spend cap');
        // Mine more: every miner carries the picked ore's crystal, the baseline's too.
        let scoredBefore = own;
        let load = (fitting: Fitting) => fitting;
        let plan: ((moduleTypeId: number) => number | null) | null = null;
        if (searched === 'mining') {
          plan = await crystalPlan(variants, catalogue, oreFamily, own, controller.signal);
          if (cancelled) return;
          const crystalFor = plan;
          if (crystalFor) {
            load = (fitting) => loadCrystals(fitting, crystalFor);
            scoredBefore = (await variants.compare(load(variants.fitting), controller.signal))
              .after;
          }
        }
        const results: ImproveResult[] = [];
        let done = 0;
        for (const set of sets) {
          const result = await findImprovements({
            fitting: variants.fitting,
            before: scoredBefore,
            goal: searched,
            hold: heldHold(own.holds, hold) ?? hold,
            candidates: set.candidates,
            stats: async (fitting) => {
              const { after } = await variants.compare(load(fitting), controller.signal);
              // A miner with no crystal of the ore would mine another ore's m³/s: left out, not compared.
              if (
                plan &&
                after.mining.rows.some(
                  (row) => !row.isDrone && row.chargeTypeId !== plan!(row.typeId)
                )
              )
                throw new Error('A miner takes no crystal of this ore');
              return after;
            },
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
          // "Show best so far" ends the whole search: the other side was not searched, so it is not compared.
          if (stopRef.current) break;
        }
        const sideResults =
          sets.length === 2 && results.length === 2
            ? ({
                [sets[0].side]: results[0],
                [sets[1].side]: results[1],
              } as Record<'shield' | 'armor', ImproveResult>)
            : undefined;
        setState({
          status: 'done',
          result: results[0],
          before: scoredBefore,
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
    oreFamily,
    hold,
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
