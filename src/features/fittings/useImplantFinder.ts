/**
 * The Implant Finder's engine half: tries implants and boosters on the open
 * Fitting and works out where to get them, so the window can say "this one
 * gets you under CPU, for this much, from here". Nothing about which item
 * does what is written down here — each family's best grade is run through
 * the engine against this very Fitting, and a goal lists only the families
 * that actually move it.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  IMPLANT_GOALS,
  boosterEntriesFromMarket,
  cheapestFixes,
  goalById,
  goalGain,
  groupImplantFamilies,
  headroom,
  headroomGain,
  implantEntriesFromMarket,
  keepMoreHeadroom,
  placeAllInSet,
  placeInSet,
  shortfall,
  type GoalContext,
  type ImplantFamily,
  type ImplantGoal,
  type ImplantGoalId,
  type ImplantGrade,
  type SlotOf,
} from '@/engine/fittings/implantFinder';
import { priceFix, rankSources, usableSource, type Source } from '@/engine/fittings/implantSources';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type {
  Fitting,
  FittingImplantSet,
  FittingStats,
  PilotProfile,
} from '@/engine/fittings/types';
import { getTradeHub, DEFAULT_TRADE_HUB, type TradeHub } from '@/market/hubs';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import { useDamageProfiles } from './damageProfiles';
import { loadImplantPurchase, type ImplantPurchase } from './implantPurchase';
import { useStatsConditions } from './statsConditions';
import { evaluateImplantSet } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

/** A gain below this is rounding, not an implant doing something. */
const MIN_GAIN = 1e-4;
/** How many fix options the window lists. */
const FIX_LIMIT = 4;
/** How many estimated fixes are re-run whole before the list is thinned to FIX_LIMIT. */
const FIX_SEARCH = 12;

const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };

export interface ImplantCatalog {
  families: ImplantFamily[];
  slotOf: SlotOf;
}

let catalogPromise: Promise<ImplantCatalog> | null = null;

/** Every implant and booster family, once per session. */
export function loadImplantCatalog(): Promise<ImplantCatalog> {
  if (!catalogPromise) {
    const pending = Promise.all([loadMarketTypes(), loadMarketGroups()]).then(([types, groups]) => {
      const implants = implantEntriesFromMarket(types, groups);
      const boosters = boosterEntriesFromMarket(types, groups);
      const slots = new Map(
        [...implants, ...boosters].map((e) => [
          e.typeId,
          { kind: e.kind ?? ('implant' as const), slot: e.slot },
        ])
      );
      return {
        families: [...groupImplantFamilies(implants), ...groupImplantFamilies(boosters)],
        slotOf: (id: number) => slots.get(id),
      };
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
  /** Every way to get it, best first; null while still being looked up. */
  sources: Source[] | null;
  /** The best of those the pilot can buy from now. */
  best: Source | null;
  /** This exact item is already in the Fitting's set. */
  inSet: boolean;
  /** What it would replace in its slot, if anything else is there. */
  replaces: number | null;
}

export interface FamilyResult {
  family: ImplantFamily;
  grades: GradeResult[];
}

export interface FixResult {
  typeIds: number[];
  cost: number;
  /** Where each item of the fix comes from, index-parallel to `typeIds`. */
  sources: Source[];
  /** The Fitting with every item of the fix in place. */
  stats: FittingStats;
  /** What is left of the budget with them, in its unit. */
  headroom: number;
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
  /** LP Stores searched so far for the selected goal's items; null when not searching. */
  storeProgress: { done: number; total: number } | null;
  catalog: ImplantCatalog | null;
  /** The Fitting on its own carried set, as the shown results measure from. */
  baseline: FittingStats | null;
  /** Every goal, with how many families move it here. */
  goals: GoalSummary[];
  /** For the selected goal; null while it loads. */
  results: FamilyResult[] | null;
  /** Cheapest ways back under budget; empty when the goal isn't a budget or already fits. */
  fixes: FixResult[];
  /** Where the shown items come from: LP Stores with the pilot's LP and the rate. */
  purchase: ImplantPurchase | null;
}

interface Input {
  open: boolean;
  fitting: Fitting | null;
  profile: PilotProfile | null;
  goalId: ImplantGoalId | null;
  hubId: TradeHub['id'];
  characterId: number | null;
  /** The Fitting page's selected Target Profile, for applied DPS. */
  target: TargetProfile | null;
}

/** Runs one implant/booster set on the Fitting, remembering every answer for as long as the Fitting is the same. */
type Evaluate = (set: FittingImplantSet) => Promise<FittingStats>;

/** The Fitting's own set and its stats, plus each occupied slot's stats with that slot left empty. */
interface Baselines {
  set: FittingImplantSet;
  stats: FittingStats;
  /** Keyed `kind:slot`; an empty slot isn't listed (its stats are `stats`). */
  emptied: Map<string, FittingStats>;
}

const slotKey = (kind: string, slot: number) => `${kind}:${slot}`;

async function runBaselines(
  evaluate: Evaluate,
  set: FittingImplantSet,
  slotOf: SlotOf
): Promise<Baselines> {
  const stats = await evaluate(set);
  const emptied = new Map<string, FittingStats>();
  for (const id of [...set.implants, ...set.boosters]) {
    const place = slotOf(id);
    if (!place || emptied.has(slotKey(place.kind, place.slot))) continue;
    const elsewhere = (other: number) => {
      const at = slotOf(other);
      return at?.kind !== place.kind || at.slot !== place.slot;
    };
    emptied.set(
      slotKey(place.kind, place.slot),
      await evaluate({
        ...set,
        implants: set.implants.filter(elsewhere),
        boosters: set.boosters.filter(elsewhere),
      })
    );
  }
  return { set, stats, emptied };
}

function setKey(set: FittingImplantSet): string {
  const sorted = (ids: readonly number[] | undefined) =>
    [...(ids ?? [])].sort((a, b) => a - b).join(',');
  return `${sorted(set.implants)}|${sorted(set.boosters)}|${sorted(set.boosterSideEffects)}`;
}

export function useImplantFinder({
  open,
  fitting,
  profile,
  goalId,
  hubId,
  characterId,
  target,
}: Input): ImplantFinderState {
  const damageProfiles = useDamageProfiles();
  const damageProfile = damageProfiles.hydrated
    ? (damageProfiles.selected ?? undefined)
    : undefined;
  const conditions = useStatsConditions();
  const context = useMemo<GoalContext>(() => (target ? { target } : {}), [target]);

  const [catalog, setCatalog] = useState<ImplantCatalog | null>(null);
  const [screening, setScreening] = useState<{
    fitting: Fitting;
    baselines: Baselines;
    bestGradeStats: Map<string, FittingStats>;
  } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failed, setFailed] = useState(false);
  /** Every grade of the families that help one goal — one consistent snapshot. */
  const [gradeRun, setGradeRun] = useState<{
    goalId: ImplantGoalId;
    familyKeys: Set<string>;
    fitting: Fitting;
    baselines: Baselines;
    stats: Map<number, FittingStats>;
  } | null>(null);
  const [purchaseRun, setPurchaseRun] = useState<{
    key: string;
    purchase: ImplantPurchase;
  } | null>(null);
  const [storeProgress, setStoreProgress] = useState<{ done: number; total: number } | null>(null);
  const [fixRun, setFixRun] = useState<{ from: object; fixes: FixResult[] } | null>(null);

  // One cache per Fitting and conditions: a goal switch or a hub change re-reads it, never the engine.
  const evaluate = useMemo<Evaluate | null>(() => {
    if (!fitting || !profile) return null;
    const runs = new Map<string, Promise<FittingStats>>();
    return (set) => {
      const key = setKey(set);
      let run = runs.get(key);
      if (!run) {
        run = evaluateImplantSet(fitting, profile, damageProfile, conditions, set);
        runs.set(key, run);
        run.catch(() => runs.delete(key));
      }
      return run;
    };
  }, [fitting, profile, damageProfile, conditions]);

  // 1. The catalog, then each family's best grade on this Fitting.
  useEffect(() => {
    if (!open || !evaluate || !fitting) return;
    let cancelled = false;
    void (async () => {
      try {
        const cat = await loadImplantCatalog();
        if (cancelled) return;
        setCatalog(cat);
        const set = fitting.implantSet ?? EMPTY_SET;
        const baselines = await runBaselines(evaluate, set, cat.slotOf);
        const bestGradeStats = new Map<string, FittingStats>();
        setProgress({ done: 0, total: cat.families.length });
        for (const [i, family] of cat.families.entries()) {
          await yieldToEventLoop();
          if (cancelled) return;
          const best = family.grades[family.grades.length - 1]!;
          bestGradeStats.set(family.key, await evaluate(placeInSet(set, cat.slotOf, best.typeId)));
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
  }, [open, evaluate, fitting]);

  /** The screening, once it describes the Fitting now open — later stages wait for it. */
  const current = screening?.fitting === fitting ? screening : null;

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
        const empty = baselines.emptied.get(slotKey(family.kind, family.slot)) ?? baselines.stats;
        return best !== undefined && goalGain(goal, empty, best, context) > MIN_GAIN;
      });
  }, [screening, catalog, context]);

  const goals = useMemo<GoalSummary[]>(
    () =>
      helpersOf ? IMPLANT_GOALS.map((goal) => ({ goal, helpers: helpersOf(goal).length })) : [],
    [helpersOf]
  );

  const goal = goalId ? goalById(goalId) : null;
  const helping = useMemo(() => (goal && helpersOf ? helpersOf(goal) : []), [goal, helpersOf]);

  // 2. Every grade of the families that help the selected goal.
  useEffect(() => {
    if (!open || !evaluate || !current || !catalog || !goalId || helping.length === 0) return;
    let cancelled = false;
    void (async () => {
      const set = current.baselines.set;
      const stats = new Map<number, FittingStats>();
      for (const family of helping) {
        for (const grade of family.grades) {
          await yieldToEventLoop();
          if (cancelled) return;
          stats.set(grade.typeId, await evaluate(placeInSet(set, catalog.slotOf, grade.typeId)));
        }
      }
      if (cancelled) return;
      setGradeRun({
        goalId,
        familyKeys: new Set(helping.map((f) => f.key)),
        fitting: current.fitting,
        baselines: current.baselines,
        stats,
      });
      setFailed(false);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, evaluate, current, catalog, goalId, helping]);

  // 3. Where each of those can be had — the market, and every LP Store that hands it out.
  const helpingTypeIds = useMemo(
    () => helping.flatMap((f) => f.grades.map((g) => g.typeId)).sort((a, b) => a - b),
    [helping]
  );
  const purchaseKey = `${hubId}|${characterId ?? ''}|${helpingTypeIds.join(',')}`;
  useEffect(() => {
    if (!open || helpingTypeIds.length === 0) return;
    let cancelled = false;
    const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
    void loadImplantPurchase(helpingTypeIds, hub, characterId, (done, total) => {
      if (!cancelled) setStoreProgress({ done, total });
    })
      .then((purchase) => {
        if (cancelled) return;
        setPurchaseRun({ key: purchaseKey, purchase });
        setStoreProgress(null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, helpingTypeIds, hubId, characterId, purchaseKey]);
  const purchase = purchaseRun?.purchase ?? null;

  // Built from one run only, so a row's effect and its Add/Remove always describe the same set.
  const shown = gradeRun && gradeRun.goalId === goalId ? gradeRun : null;
  const results = useMemo<FamilyResult[] | null>(() => {
    if (!goal || !catalog || !helpersOf) return null;
    if (!shown) return helping.length === 0 ? [] : null;
    const set = shown.baselines.set;
    const inSet = [...set.implants, ...set.boosters];
    return catalog.families
      .filter((family) => shown.familyKeys.has(family.key))
      .map((family) => {
        const occupant = inSet.find((id) => {
          const at = catalog.slotOf(id);
          return at?.kind === family.kind && at.slot === family.slot;
        });
        const grades = family.grades.map((grade) => {
          const sources = purchase
            ? rankSources(grade.typeId, purchase.offersFor(grade.typeId), purchase.context)
            : null;
          return {
            grade,
            stats: shown.stats.get(grade.typeId)!,
            sources,
            best: sources ? usableSource(sources) : null,
            inSet: inSet.includes(grade.typeId),
            replaces: occupant !== undefined && occupant !== grade.typeId ? occupant : null,
          };
        });
        const bestGain = Math.max(
          ...grades.map((g) => goalGain(goal, shown.baselines.stats, g.stats, context))
        );
        return { family, grades, bestGain };
      })
      .sort((a, b) => b.bestGain - a.bestGain)
      .map(({ family, grades }) => ({ family, grades }));
  }, [goal, catalog, helpersOf, helping, shown, purchase, context]);

  // 4. Cheapest fixes: searched on each item's own headroom, then re-run whole and priced together.
  useEffect(() => {
    if (!open || !evaluate || !catalog || !goal || goal.kind !== 'budget') return;
    if (!shown || !results || !purchase || shown.fitting !== fitting) return;
    const before = shown.baselines.stats;
    const needed = shortfall(goal.read(before));
    if (needed <= 0) return;
    const candidates = results.flatMap((r) =>
      r.grades
        .filter((g) => !g.inSet)
        .map((g) => ({
          typeId: g.grade.typeId,
          // Implant and booster slots are numbered apart; keep them apart here too.
          slot: r.family.kind === 'booster' ? 100 + r.family.slot : r.family.slot,
          headroomGain: headroomGain(goal, before, g.stats),
          price: g.best?.cost ?? Number.NaN,
        }))
    );
    let cancelled = false;
    void (async () => {
      const confirmed: FixResult[] = [];
      // Search wider than shown: stacking can sink an estimate below the line.
      for (const option of cheapestFixes(candidates, needed, FIX_SEARCH)) {
        await yieldToEventLoop();
        if (cancelled) return;
        const stats = await evaluate(
          placeAllInSet(shown.baselines.set, catalog.slotOf, option.typeIds)
        );
        const budget = goal.read(stats);
        // Bought together: one store's LP and the pilot's tags are spent once.
        const priced = priceFix(option.typeIds, purchase.offersFor, purchase.context);
        if (shortfall(budget) <= 0 && priced) {
          confirmed.push({
            typeIds: option.typeIds,
            cost: priced.cost,
            sources: priced.sources,
            stats,
            headroom: headroom(budget),
          });
        }
      }
      if (cancelled) return;
      setFixRun({ from: shown, fixes: keepMoreHeadroom(confirmed).slice(0, FIX_LIMIT) });
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, evaluate, catalog, goal, shown, results, purchase, fitting]);

  const over = goal?.kind === 'budget' && shown ? shortfall(goal.read(shown.baselines.stats)) : 0;
  // An older run's fix list stays up, marked updating, until the new one is confirmed.
  const fixes = over > 0 && fixRun ? fixRun.fixes : [];
  const fixesCurrent = over <= 0 || fixRun?.from === shown;
  const resultsCurrent = goal === null || helping.length === 0 || shown?.fitting === fitting;
  const purchaseCurrent = helping.length === 0 || purchaseRun?.key === purchaseKey;

  return {
    status: failed ? 'error' : screening ? 'ready' : 'loading',
    updating:
      screening !== null && (!current || !resultsCurrent || !fixesCurrent || !purchaseCurrent),
    progress,
    storeProgress,
    catalog,
    baseline: shown?.baselines.stats ?? screening?.baselines.stats ?? null,
    goals,
    results,
    fixes,
    purchase,
  };
}
