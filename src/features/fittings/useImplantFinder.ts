/**
 * The implant finder's engine half: tries implants on the open Fitting and
 * prices them, so the modal can say "this one gets you under CPU, for this
 * much, at your Trade Hub". Nothing about which implant does what is
 * written down here — each family's best grade is run through the engine
 * against this very Fitting, and a goal lists only the families that
 * actually move it.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  IMPLANT_GOALS,
  cheapestFixes,
  goalById,
  goalGain,
  groupImplantFamilies,
  headroom,
  headroomGain,
  implantEntriesFromMarket,
  keepMoreHeadroom,
  pickSource,
  shortfall,
  withImplant,
  type HubPrice,
  type ImplantFamily,
  type ImplantGoal,
  type ImplantGoalId,
  type ImplantGrade,
  type ImplantSource,
} from '@/engine/fittings/implantFinder';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import { useDamageProfiles } from './damageProfiles';
import { useStatsConditions } from './statsConditions';
import { evaluateImplantSet } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

/** A gain below this is rounding, not an implant doing something. */
const MIN_GAIN = 1e-4;
/** How many fix options the modal lists. */
const FIX_LIMIT = 4;
/** How many estimated fixes are re-run whole before the list is thinned to FIX_LIMIT. */
const FIX_SEARCH = 12;

export interface ImplantCatalog {
  families: ImplantFamily[];
  slotOf: (typeId: number) => number | undefined;
}

let catalogPromise: Promise<ImplantCatalog> | null = null;

/** Every implant family, once per session. */
export function loadImplantCatalog(): Promise<ImplantCatalog> {
  if (!catalogPromise) {
    const pending = Promise.all([loadMarketTypes(), loadMarketGroups()]).then(([types, groups]) => {
      const entries = implantEntriesFromMarket(types, groups);
      const slots = new Map(entries.map((e) => [e.typeId, e.slot]));
      return { families: groupImplantFamilies(entries), slotOf: (id: number) => slots.get(id) };
    });
    catalogPromise = pending;
    pending.catch(() => {
      if (catalogPromise === pending) catalogPromise = null;
    });
  }
  return catalogPromise;
}

export interface GradeResult {
  grade: ImplantGrade;
  stats: FittingStats;
  gain: number;
  /** Where to buy it; null when no Trade Hub sells it. */
  source: ImplantSource | null;
  /** This exact implant is already in the Fitting's set. */
  inSet: boolean;
  /** What it would replace in its slot, if anything else is there. */
  replaces: number | null;
}

export interface FamilyResult {
  family: ImplantFamily;
  grades: GradeResult[];
  /** The family's best gain on this goal, for ordering. */
  bestGain: number;
}

export interface FixResult {
  typeIds: number[];
  cost: number;
  /** The Fitting with every implant of the option in place. */
  stats: FittingStats;
}

export interface GoalSummary {
  goal: ImplantGoal;
  /** Families that move this goal on this Fitting. */
  helpers: number;
}

export interface ImplantFinderState {
  status: 'loading' | 'ready' | 'error';
  /** Showing the last results while the Fitting's new ones are worked out (after an Add). */
  updating: boolean;
  /** How many families have been tried, for a progress line. */
  progress: { done: number; total: number };
  catalog: ImplantCatalog | null;
  /** The Fitting on its own carried set, as the shown results measure from. */
  baseline: FittingStats | null;
  /** Budget goals always; the rest only when some implant moves them. */
  goals: GoalSummary[];
  /** For the selected goal; null while it loads. */
  results: FamilyResult[] | null;
  /** Cheapest ways back under budget; empty when the goal isn't a budget or already fits. */
  fixes: FixResult[];
}

interface Input {
  open: boolean;
  fitting: Fitting | null;
  profile: PilotProfile | null;
  goalId: ImplantGoalId | null;
  hubId: TradeHub['id'];
}

type Evaluate = (implants: readonly number[]) => Promise<FittingStats>;

async function hubPrices(typeIds: number[]): Promise<Map<number, HubPrice[]>> {
  const perHub = await Promise.all(
    TRADE_HUBS.map(async (hub) => ({ hub, prices: await getHubPrices(hub, typeIds) }))
  );
  const byType = new Map<number, HubPrice[]>();
  for (const typeId of typeIds) {
    byType.set(
      typeId,
      perHub.map(({ hub, prices }) => {
        const aggregate = prices.get(typeId);
        return {
          hubId: hub.id,
          sellMin: aggregate?.sellMin ?? null,
          sellVolume: aggregate?.sellVolume ?? 0,
        };
      })
    );
  }
  return byType;
}

/** The Fitting's own set and its stats, plus each occupied slot's stats with that slot left empty. */
interface Baselines {
  implants: readonly number[];
  stats: FittingStats;
  /** Keyed by slot; a slot with nothing in it isn't listed (its stats are `stats`). */
  emptied: Map<number, FittingStats>;
}

async function runBaselines(
  evaluate: Evaluate,
  implants: readonly number[],
  slotOf: (typeId: number) => number | undefined
): Promise<Baselines> {
  const stats = await evaluate(implants);
  const emptied = new Map<number, FittingStats>();
  for (const id of implants) {
    const slot = slotOf(id);
    if (slot === undefined || emptied.has(slot)) continue;
    emptied.set(slot, await evaluate(implants.filter((other) => slotOf(other) !== slot)));
  }
  return { implants, stats, emptied };
}

export function useImplantFinder({
  open,
  fitting,
  profile,
  goalId,
  hubId,
}: Input): ImplantFinderState {
  const damageProfiles = useDamageProfiles();
  const damageProfile = damageProfiles.hydrated
    ? (damageProfiles.selected ?? undefined)
    : undefined;
  const conditions = useStatsConditions();

  const [catalog, setCatalog] = useState<ImplantCatalog | null>(null);
  /** Each family's best grade run on the Fitting. */
  const [screening, setScreening] = useState<{
    fitting: Fitting;
    baselines: Baselines;
    bestGradeStats: Map<string, FittingStats>;
  } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failed, setFailed] = useState(false);
  /** Every grade of the families that help one goal, with prices — one consistent snapshot. */
  const [gradeRun, setGradeRun] = useState<{
    goalId: ImplantGoalId;
    familyKeys: string[];
    fitting: Fitting;
    baselines: Baselines;
    stats: Map<number, FittingStats>;
    prices: Map<number, HubPrice[]>;
  } | null>(null);
  const [fixRun, setFixRun] = useState<{
    from: object;
    hubId: string;
    fixes: FixResult[];
  } | null>(null);

  const implants = fitting?.implantSet?.implants;
  const evaluate = useMemo<Evaluate | null>(
    () =>
      fitting && profile
        ? (set) => evaluateImplantSet(fitting, profile, damageProfile, conditions, set)
        : null,
    [fitting, profile, damageProfile, conditions]
  );

  // 1. The catalog, then each family's best grade on this Fitting.
  useEffect(() => {
    if (!open || !evaluate || !fitting) return;
    let cancelled = false;
    void (async () => {
      try {
        const cat = await loadImplantCatalog();
        if (cancelled) return;
        setCatalog(cat);
        const current = implants ?? [];
        const baselines = await runBaselines(evaluate, current, cat.slotOf);
        const bestGradeStats = new Map<string, FittingStats>();
        setProgress({ done: 0, total: cat.families.length });
        for (const [i, family] of cat.families.entries()) {
          await yieldToEventLoop();
          if (cancelled) return;
          const best = family.grades[family.grades.length - 1]!;
          bestGradeStats.set(
            family.key,
            await evaluate(withImplant(current, cat.slotOf, best.typeId))
          );
          if (i % 16 === 0) setProgress({ done: i + 1, total: cat.families.length });
        }
        if (cancelled) return;
        setProgress({ done: cat.families.length, total: cat.families.length });
        setScreening({ fitting, baselines, bestGradeStats });
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, evaluate, fitting, implants]);

  /**
   * Families that move `goal` at all: their best grade against their slot
   * left empty — so a family already in the set still counts, and keeps its
   * Remove and its lower grades.
   */
  const helpersOf = useMemo(() => {
    if (!screening || !catalog) return null;
    const { baselines, bestGradeStats } = screening;
    return (goal: ImplantGoal) =>
      catalog.families.filter((family) => {
        const best = bestGradeStats.get(family.key);
        const empty = baselines.emptied.get(family.slot) ?? baselines.stats;
        return best !== undefined && goalGain(goal, empty, best) > MIN_GAIN;
      });
  }, [screening, catalog]);

  const goals = useMemo<GoalSummary[]>(() => {
    if (!helpersOf) return [];
    return IMPLANT_GOALS.flatMap((goal) => {
      const helpers = helpersOf(goal).length;
      return goal.kind === 'budget' || helpers > 0 ? [{ goal, helpers }] : [];
    });
  }, [helpersOf]);

  const goal = goalId ? goalById(goalId) : null;
  const helping = useMemo(() => (goal && helpersOf ? helpersOf(goal) : []), [goal, helpersOf]);

  // 2. Every grade of the families that help the selected goal, and their prices at every hub.
  useEffect(() => {
    if (!open || !evaluate || !fitting || !catalog || !goalId || helping.length === 0) return;
    let cancelled = false;
    void (async () => {
      const current = implants ?? [];
      const typeIds = helping.flatMap((f) => f.grades.map((g) => g.typeId));
      const pricesPending = hubPrices(typeIds);
      // Never left unhandled when a newer run cancels this one before it's awaited.
      pricesPending.catch(() => {});
      const baselines = await runBaselines(evaluate, current, catalog.slotOf);
      const stats = new Map<number, FittingStats>();
      for (const family of helping) {
        for (const grade of family.grades) {
          await yieldToEventLoop();
          if (cancelled) return;
          stats.set(
            grade.typeId,
            await evaluate(withImplant(current, catalog.slotOf, grade.typeId))
          );
        }
      }
      const prices = await pricesPending;
      if (cancelled) return;
      const familyKeys = helping.map((f) => f.key);
      setGradeRun({ goalId, familyKeys, fitting, baselines, stats, prices });
      setFailed(false);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, evaluate, fitting, catalog, goalId, helping, implants]);

  // Built from one run only, so a row's effect and its Add/Remove always describe the same set.
  const shown = gradeRun && gradeRun.goalId === goalId ? gradeRun : null;
  const results = useMemo<FamilyResult[] | null>(() => {
    if (!goal || !catalog || !helpersOf) return null;
    if (!shown) return helping.length === 0 ? [] : null;
    const current = shown.baselines.implants;
    return catalog.families
      .filter((family) => shown.familyKeys.includes(family.key))
      .map((family) => {
        const occupant = current.find((id) => catalog.slotOf(id) === family.slot);
        const grades = family.grades.map((grade) => {
          const stats = shown.stats.get(grade.typeId)!;
          return {
            grade,
            stats,
            gain: goalGain(goal, shown.baselines.stats, stats),
            source: pickSource(shown.prices.get(grade.typeId) ?? [], hubId),
            inSet: current.includes(grade.typeId),
            replaces: occupant !== undefined && occupant !== grade.typeId ? occupant : null,
          };
        });
        return { family, grades, bestGain: Math.max(...grades.map((g) => g.gain)) };
      })
      .sort((a, b) => b.bestGain - a.bestGain);
  }, [goal, catalog, helpersOf, helping, shown, hubId]);

  // 3. Cheapest fixes: searched on each implant's own headroom, then re-run whole to confirm.
  useEffect(() => {
    if (!open || !evaluate || !catalog || !goal || goal.kind !== 'budget' || !shown || !results) {
      return;
    }
    const before = shown.baselines.stats;
    const needed = shortfall(goal.read(before));
    if (needed <= 0) return;
    const candidates = results.flatMap((r) =>
      r.grades
        .filter((g) => !g.inSet)
        .map((g) => ({
          typeId: g.grade.typeId,
          slot: r.family.slot,
          headroomGain: headroomGain(goal, before, g.stats),
          price: g.source?.price ?? Number.NaN,
        }))
    );
    let cancelled = false;
    void (async () => {
      const confirmed: (FixResult & { headroom: number })[] = [];
      // Search wider than shown: stacking can sink an estimate below the line.
      for (const option of cheapestFixes(candidates, needed, FIX_SEARCH)) {
        await yieldToEventLoop();
        if (cancelled) return;
        let set = shown.baselines.implants;
        for (const id of option.typeIds) set = withImplant(set, catalog.slotOf, id);
        const stats = await evaluate(set);
        const budget = goal.read(stats);
        if (shortfall(budget) <= 0) {
          confirmed.push({ ...option, stats, headroom: headroom(budget) });
        }
      }
      if (cancelled) return;
      const fixes = keepMoreHeadroom(confirmed)
        .slice(0, FIX_LIMIT)
        .map(({ typeIds, cost, stats }) => ({ typeIds, cost, stats }));
      setFixRun({ from: shown, hubId, fixes });
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, evaluate, catalog, goal, shown, results, hubId]);

  const over = goal?.kind === 'budget' && shown ? shortfall(goal.read(shown.baselines.stats)) : 0;
  // An older run's fix list stays up, marked updating, until the new one is confirmed.
  const fixes = over > 0 && fixRun ? fixRun.fixes : [];
  const fixesCurrent = over <= 0 || (fixRun?.from === shown && fixRun.hubId === hubId);

  return {
    status: failed ? 'error' : screening ? 'ready' : 'loading',
    updating:
      screening !== null &&
      (screening.fitting !== fitting ||
        (goal !== null && helping.length > 0 && (shown?.fitting !== fitting || !fixesCurrent))),
    progress,
    catalog,
    baseline: shown?.baselines.stats ?? screening?.baselines.stats ?? null,
    goals,
    results,
    fixes,
  };
}
