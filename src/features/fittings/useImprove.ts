/**
 * Improve for the open Fitting (`findImprovements`): every fitted module's
 * variations the hull takes and the pilot can fly, recalculated whole under
 * the same evaluator the page's stats come from (Damage Profile, Overheat
 * all, implant basis), scored against the page's Target Profile and priced
 * at the pilot's Trade Hub. Runs only while `enabled`, so a closed drawer
 * costs nothing; Cancel aborts the calculation in the worker.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_IMPROVE_HOLD,
  findImprovements,
  goalAvailability,
  effectiveHold,
  IMPROVE_GOALS,
  IMPROVE_HOLDS,
  IMPROVE_REACHES,
  improveCandidates,
  type DefenseChoice,
  onlyNeutral,
  onlySide,
  type ImproveCandidate,
  type ImproveGoal,
  type ImproveHold,
  type ImproveReach,
  type ImproveResult,
  type ModulePool,
} from '@/engine/fittings/improve';
import { overBudgetResources } from '@/engine/fittings/improveFree';
import {
  DEFAULT_GOAL_OF_ROLE,
  HULL_ROLES,
  hullRoleOf,
  type GoalsByRole,
  type HullRef,
} from '@/engine/fittings/improveRole';
import {
  bestCrystalKey,
  crystalKeyOf,
  crystalsOfFamily,
  loadCrystals,
  minerWithoutCrystal,
  unloadedMiners,
} from '@/engine/fittings/improveMining';
import { assumeCharges, type ChargeLoadStep } from '@/engine/fittings/improveCharges';
import { CRYSTAL_FAMILY_ORES } from '@/engine/fittings/crystalChoice';
import { IMPROVE_SORTS, type ImproveSort } from '@/engine/fittings/improveRows';
import { TANK_GOALS, type DefenseSide } from '@/engine/fittings/improveGroups';
import type { FitSwap, Resource } from '@/engine/fittings/makeItFit';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import { buildVariationIndex, getVariations } from '@/engine/market/variations';
import { db } from '@/db';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadFittingPrice } from './fittingPrice';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';

/**
 * The old global Improve Goal, kept only to seed a role that has none yet
 * (`rememberedGoal`); the goal is now remembered per hull role.
 */
export const useImproveGoal = createLocalSetting<ImproveGoal>({
  key: 'fittingsImproveGoal',
  defaultValue: 'overall',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_GOALS as readonly string[]).includes(raw)
      ? (raw as ImproveGoal)
      : 'overall',
});

/** The last Improve Goal per hull role (combat, mining, ...), remembered on this device. */
export const useImproveGoalByRole = createLocalSetting<GoalsByRole>({
  key: 'fittingsImproveGoalByRole',
  defaultValue: {},
  parse: (raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const goals = raw as Record<string, unknown>;
    const kept: GoalsByRole = {};
    for (const role of HULL_ROLES) {
      const goal = goals[role];
      if (typeof goal === 'string' && (IMPROVE_GOALS as readonly string[]).includes(goal))
        kept[role] = goal as ImproveGoal;
    }
    return kept;
  },
});

/** The open Fitting's hull as the catalogue knows it; undefined while either is unknown. */
export function hullOf(
  fitting: Fitting | null | undefined,
  catalogue: FittingCatalogue | null
): HullRef | undefined {
  const groupId = fitting ? catalogue?.types[String(fitting.shipTypeId)]?.groupID : undefined;
  return fitting && groupId !== undefined ? { typeId: fitting.shipTypeId, groupId } : undefined;
}

/** The goal to search: `goal` if the fit can score it, else the hull role's default, else Best overall. */
export function searchableGoal(
  goal: ImproveGoal,
  before: FittingStats,
  hull: HullRef | undefined
): ImproveGoal {
  if (goalAvailability(goal, before, hull).available) return goal;
  const fallback = DEFAULT_GOAL_OF_ROLE[hullRoleOf(hull)];
  return goalAvailability(fallback, before, hull).available ? fallback : 'overall';
}

/** How far Improve goes from the fitted modules, remembered on this device. */
export const useImproveReach = createLocalSetting<ImproveReach>({
  key: 'fittingsImproveReach',
  defaultValue: 'upgrade',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_REACHES as readonly string[]).includes(raw)
      ? (raw as ImproveReach)
      : 'upgrade',
});

/** How Improve orders each section's rows, remembered on this device. */
export const useImproveSort = createLocalSetting<ImproveSort>({
  key: 'fittingsImproveSort',
  defaultValue: 'gain',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_SORTS as readonly string[]).includes(raw)
      ? (raw as ImproveSort)
      : 'gain',
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

const parseCap = (raw: unknown) =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;

/** The total budget in ISK; null is no limit. */
export const useImproveBudget = createLocalSetting<number | null>({
  key: 'fittingsImproveBudget',
  defaultValue: null,
  parse: parseCap,
});

/** Rows of the removed Refitting mode, dropped on the next start. */
const RETIRED_KEYS = ['fittingsImproveMode', 'fittingsImproveRefitCap'];

const LEGACY_SPEND_CAP_KEY = 'fittingsImproveSpendCap';

/**
 * One shared cap used to serve both modes. Moves it to the budget when Planning was the mode (or none was stored), once, then drops the old row; the Refitting rows go with it.
 */
export async function migrateSpendCap(): Promise<void> {
  const mode = (await db.settings.get('fittingsImproveMode'))?.value;
  const legacy = await db.settings.get(LEGACY_SPEND_CAP_KEY);
  if (legacy) {
    const cap = parseCap(legacy.value);
    if (cap !== null && (mode === undefined || mode === 'buy')) {
      await useImproveBudget.getState().hydrate();
      if (useImproveBudget.getState().value === null) {
        await useImproveBudget.getState().setValue(cap);
      }
    }
    await db.settings.delete(LEGACY_SPEND_CAP_KEY);
  }
  await db.settings.bulkDelete(RETIRED_KEYS);
}

/** What the drawer asks of one search beyond the goal. */
export interface ImproveConfig {
  reach: ImproveReach;
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
  /** Planning's budget is under the fit's own price: nothing is searched until it changes. */
  | { status: 'belowPrice'; budget: number; fitTotal: number }
  | { status: 'failed' }
  | {
      status: 'done';
      result: ImproveResult;
      before: FittingStats;
      /** What the fit costs now at the hub, for the selection summary; null when not loaded. */
      fitTotal: number | null;
      elapsedMs: number;
      /** A tank goal under Shield or Armor: both sides' results, to compare. */
      sides?: Record<'shield' | 'armor', ImproveResult>;
      /** With `sides`: the options on neither side (Damage Control, hull), shown as "Either". */
      neutral?: ImproveResult;
      /** Mine more: the fit as it is, whose yield is the real "Now"; `before` is scored with the best crystals. */
      fitAsIs?: FittingStats;
      /** Mine more: the best crystal's key, and the miners that hold none of the ore's crystals. */
      crystals?: { bestKey: string; unloaded: { count: number; steps: ChargeLoadStep[] } | null };
    };

export interface ImproveSearch {
  /** The goal searched: the remembered one, or the hull role's default when this fit cannot score it. */
  goal: ImproveGoal;
  /** The open Fitting's hull, for the goal chips' role unlock. */
  hull?: HullRef;
  state: ImproveState;
  /** The open Fitting's stats before any swap, for each row's goal check; null until known. */
  before: FittingStats | null;
  cancel: () => void;
  showBestSoFar: () => void;
  /** Runs the search again after a Cancel. */
  restart: () => void;
  /** One whole-fit recalculation under the search's own conditions, for the ticked set; null before a search has run. */
  recalc: ((fitting: Fitting) => Promise<FittingStats>) | null;
  /**
   * The swaps and prices that could cover a ticked set running the fit out of CPU,
   * powergrid or calibration, fetched on the first ask (most sets never need them); null before a search has run.
   */
  completion: (() => Promise<CompletionPool>) | null;
}

/** What `findCompletions` needs beyond the ticked set. */
export interface CompletionPool {
  swaps: FitSwap[];
  priceOf: (typeId: number) => number | null;
}

/** The module pool the catalogue gives Rework and the fills: group, group members, market-listed, hull and skills. */
function modulePool(catalogue: FittingCatalogue, variants: VariantEvaluator): ModulePool {
  const listed = new Set(catalogue.marketTypes.map((entry) => entry.typeId));
  const flyable = new Map<string, boolean>();
  const skilled = new Map<string, boolean>();
  return {
    groupOf: (typeId) => catalogue.types[String(typeId)]?.groupID,
    typeIdsInGroup: (groupId) => catalogue.typeIdsByGroup.get(groupId) ?? [],
    published: (typeId) => listed.has(typeId),
    // A fitted module the pilot lacks skills for is replaced; its hull fit is not asked again.
    pilotCanFly: (slot, typeId) => {
      const key = `${slot}:${typeId}`;
      let ok = skilled.get(key);
      if (ok === undefined) {
        const check = variants.engine
          .checkCandidates(variants.fitting.shipTypeId, slot, [typeId], variants.profile)
          .get(typeId);
        ok = check ? check.canFly : true;
        skilled.set(key, ok);
      }
      return ok;
    },
    // A candidate the pilot lacks skills for goes under Train instead.
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

/** Mine more's ore plan: what each miner loads, the best crystal's key, and which crystals each miner type takes. */
interface CrystalPlan {
  crystalFor: (moduleTypeId: number) => number | null;
  bestKey: string;
  crystalsOf: (moduleTypeId: number) => number[];
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
): Promise<CrystalPlan | null> {
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
  return best === null
    ? null
    : { crystalFor: forKey(best), bestKey: best, crystalsOf: crystalsFor };
}

/** Officer and Deadspace meta groups: never offered as a stand-in, as in the search proper. */
const EXCLUDED_META_GROUPS: ReadonlySet<number> = new Set([5, 6]);

/**
 * The module and rig swaps that can pay for an unflyable-module fix that runs
 * the fit out of CPU, powergrid or calibration: every other fitted module's
 * and rig's siblings the hull takes and the pilot can fly, whatever the Reach
 * or the rigs tick. Empty when the fit has no module to replace.
 */
function compensationSwaps(
  variants: VariantEvaluator,
  catalogue: FittingCatalogue,
  hasFix: boolean
): FitSwap[] {
  if (!hasFix) return [];
  const index = buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups);
  const pool = modulePool(catalogue, variants);
  return variants.fitting.modules.flatMap((module) => {
    if (module.slot === 'subsystem') return [];
    return getVariations(index, module.typeId)
      .members.filter(
        (member) =>
          member.typeId !== module.typeId &&
          catalogue.rackOf[String(member.typeId)] === module.slot &&
          pool.published(member.typeId) &&
          !EXCLUDED_META_GROUPS.has(index.types[member.typeId]?.metaGroupId ?? 0) &&
          (pool.flyable?.(module.slot, member.typeId) ?? true)
      )
      .map((member) => ({
        slot: module.slot,
        slotIndex: module.slotIndex,
        fromTypeId: module.typeId,
        toTypeId: member.typeId,
      }));
  });
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

const NO_CHARGES: readonly ChargeLoadStep[] = [];

export function useImprove(
  variants: VariantEvaluator | null,
  catalogue: FittingCatalogue | null,
  goal: ImproveGoal,
  target: TargetProfile | undefined,
  enabled: boolean,
  config: ImproveConfig,
  chargePlan: readonly ChargeLoadStep[] = NO_CHARGES
): ImproveSearch {
  const hubId = useMarketHub((state) => state.value);
  // The plan is a new array each render; the search reruns only when its content changes.
  const chargePlanKey = JSON.stringify(chargePlan);
  const [state, setState] = useState<ImproveState>({ status: 'idle' });
  const [before, setBefore] = useState<FittingStats | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelRef = useRef<() => void>(() => {});
  const stopRef = useRef(false);
  const [recalc, setRecalc] = useState<ImproveSearch['recalc']>(null);
  const [completion, setCompletion] = useState<ImproveSearch['completion']>(null);
  const { reach, spendCap, defense, includeRigs, includeOfficer, oreFamily, hold } = config;
  const hullTypeId = variants?.fitting.shipTypeId;
  const hullGroupId =
    hullTypeId === undefined ? undefined : catalogue?.types[String(hullTypeId)]?.groupID;
  const hull = useMemo(
    () =>
      hullTypeId !== undefined && hullGroupId !== undefined
        ? { typeId: hullTypeId, groupId: hullGroupId }
        : undefined,
    [hullTypeId, hullGroupId]
  );

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
    setRecalc(null);
    setCompletion(null);
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
        // A remembered goal this fit cannot score (Longer reach on a drone boat) searches the role's default.
        const searched = searchableGoal(goal, own, hull);
        // A tank goal under Shield or Armor runs both sides, the chosen one first, to compare them.
        const sides: DefenseChoice[] =
          defense !== 'keep' && reach !== 'upgrade' && TANK_GOALS.has(searched)
            ? [defense, defense === 'shield' ? 'armor' : 'shield']
            : [reach === 'upgrade' ? 'keep' : defense];
        const sets = sides.map((side) => ({
          side,
          candidates: searchCandidates(
            variants,
            catalogue,
            searched,
            {
              reach,
              spendCap,
              defense: side,
              includeRigs,
              includeOfficer,
              oreFamily,
              hold,
            },
            own.slotCounts
          ),
        }));
        const total = sets.reduce((sum, set) => sum + set.candidates.length, 0);
        setState((current) =>
          current.status === 'searching' ? { ...current, checked: 0, total } : current
        );
        const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
        const candidates = sets.flatMap((set) => set.candidates);
        const compensation = compensationSwaps(
          variants,
          catalogue,
          candidates.some((candidate) => candidate.fixesUnflyable)
        );
        const typeIds = [
          ...new Set([
            ...candidateTypeIds(candidates),
            ...compensation.flatMap((swap) => [swap.fromTypeId, swap.toTypeId]),
          ]),
        ];
        const [priceMap, fitTotal] = await Promise.all([
          getHubPrices(hub, typeIds).catch(() => null),
          // The Price section's own total, for the budget.
          loadFittingPrice(variants.fitting, hub)
            .then((price) => price.totals.sell)
            .catch(() => null),
        ]);
        if (cancelled) return;
        // A cap that cannot be checked is not silently waived.
        if (spendCap !== null && (priceMap === null || fitTotal === null))
          throw new Error('Prices unavailable for the spend cap');
        if (spendCap !== null && fitTotal !== null && spendCap < fitTotal) {
          setState({ status: 'belowPrice', budget: spendCap, fitTotal });
          return;
        }
        // Mine more: every miner carries the picked ore's crystal, the baseline's too.
        let scoredBefore = own;
        // Empty guns and launchers are scored loaded with the best charge, so an unarmed-looking fit isn't stripped of support.
        const charges = JSON.parse(chargePlanKey) as ChargeLoadStep[];
        let load = (fitting: Fitting) => assumeCharges(fitting, variants.fitting, charges);
        let plan: CrystalPlan | null = null;
        if (searched === 'mining') {
          plan = await crystalPlan(variants, catalogue, oreFamily, own, controller.signal);
          if (cancelled) return;
          const crystalFor = plan?.crystalFor;
          if (crystalFor) {
            load = (fitting) =>
              loadCrystals(assumeCharges(fitting, variants.fitting, charges), crystalFor);
            scoredBefore = (await variants.compare(load(variants.fitting), controller.signal))
              .after;
          }
        }
        if (searched !== 'mining' && charges.length > 0)
          scoredBefore = (await variants.compare(load(variants.fitting), controller.signal)).after;
        const stats = async (fitting: Fitting) => {
          const { after } = await variants.compare(load(fitting), controller.signal);
          // A miner with no crystal of the ore would mine another ore's m³/s: left out, not compared.
          if (plan && minerWithoutCrystal(after.mining.rows, plan.crystalFor))
            throw new Error('A miner takes no crystal of this ore');
          return after;
        };
        const results: ImproveResult[] = [];
        let done = 0;
        for (const set of sets) {
          const result = await findImprovements({
            fitting: variants.fitting,
            before: scoredBefore,
            goal: searched,
            hold: effectiveHold(own.holds, hold),
            candidates: set.candidates,
            stats,
            priceOf: (typeId) => priceMap?.get(typeId)?.sellMin ?? null,
            ...(target ? { target } : {}),
            spendCap,
            fitTotal,
            compensators: (fix) =>
              compensation.filter(
                (swap) =>
                  !fix.at.some((at) => at.slot === swap.slot && at.slotIndex === swap.slotIndex)
              ),
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
        // A side counts only the options that put its own tank modules on the fit.
        const groupOf = (typeId: number) => catalogue.types[String(typeId)]?.groupID;
        const bySide = sets.length === 2;
        // "Show best so far" can end the search with one side done: it is filtered but not compared.
        const sided = bySide
          ? results.map((result, i) => onlySide(result, sets[i].side as DefenseSide, groupOf))
          : results;
        // The list drops only the other side's swaps; a weapon or Damage Control swap still counts for Best overall.
        const listed = bySide
          ? onlySide(results[0], sets[0].side as DefenseSide, groupOf, false)
          : results[0];
        // One count for both side runs, the same total the progress bar showed.
        const checked = results.reduce((sum, result) => sum + result.checked, 0);
        const sideResults =
          bySide && results.length === 2
            ? ({
                [sets[0].side]: sided[0],
                [sets[1].side]: sided[1],
              } as Record<DefenseSide, ImproveResult>)
            : undefined;
        setRecalc(() => stats);
        let pool: Promise<CompletionPool> | null = null;
        setCompletion(
          () => () =>
            (pool ??= (async () => {
              const swaps = compensationSwaps(variants, catalogue, true);
              const prices = await getHubPrices(hub, [
                ...new Set(swaps.flatMap((swap) => [swap.fromTypeId, swap.toTypeId])),
              ]).catch(() => null);
              return {
                swaps,
                priceOf: (typeId: number) => prices?.get(typeId)?.sellMin ?? null,
              };
            })().catch((error: unknown) => {
              // A failed lookup is asked again next time, not remembered.
              pool = null;
              throw error;
            }))
        );
        setState({
          status: 'done',
          result: { ...listed, checked },
          before: scoredBefore,
          ...(plan
            ? {
                fitAsIs: own,
                crystals: {
                  bestKey: plan.bestKey,
                  unloaded: unloadedMiners(variants.fitting, plan.crystalsOf, plan.crystalFor),
                },
              }
            : {}),
          fitTotal,
          elapsedMs: performance.now() - started,
          ...(sideResults ? { sides: sideResults, neutral: onlyNeutral(results[0], groupOf) } : {}),
        });
      } catch {
        if (!cancelled) setState({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      // Its signal is aborted: a recalculation through it would fail.
      setRecalc(null);
      setCompletion(null);
      clearTimeout(slowTimer);
    };
  }, [
    enabled,
    variants,
    catalogue,
    goal,
    hull,
    target,
    hubId,
    attempt,
    reach,
    spendCap,
    defense,
    includeRigs,
    includeOfficer,
    oreFamily,
    hold,
    chargePlanKey,
  ]);

  const cancel = useCallback(() => cancelRef.current(), []);
  const showBestSoFar = useCallback(() => {
    stopRef.current = true;
  }, []);
  const restart = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    goal: before ? searchableGoal(goal, before, hull) : goal,
    hull,
    state: enabled ? state : { status: 'idle' },
    before: enabled ? before : null,
    cancel,
    showBestSoFar,
    restart,
    recalc: enabled ? recalc : null,
    completion: enabled ? completion : null,
  };
}
