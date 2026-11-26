import { idSetKey } from '@/lib/idSetKey';
import { useEffect, useMemo, useState } from 'react';
import {
  IMPLANT_GOALS,
  cheapestFixes,
  goalById,
  goalGain,
  groupImplantFamilies,
  headroom,
  headroomGain,
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
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { loadImplantMarketEntries } from './implantSlotLookup';
import { useDamageProfiles } from './damageProfiles';
import { loadImplantPurchase, type ImplantPurchase } from './implantPurchase';
import { useStatsConditions } from './statsConditions';
import { evaluateImplantSet } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

const MIN_GAIN = 1e-4;
const FIX_LIMIT = 4;
const FIX_SEARCH = 12;

const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };

export interface ImplantCatalog {
  families: ImplantFamily[];
  slotOf: SlotOf;
}

let catalogPromise: Promise<ImplantCatalog> | null = null;

export function loadImplantCatalog(): Promise<ImplantCatalog> {
  if (!catalogPromise) {
    const pending = loadImplantMarketEntries().then(({ implants, boosters, slotOf }) => ({
      families: [...groupImplantFamilies(implants), ...groupImplantFamilies(boosters)],
      slotOf,
    }));
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
  sources: Source[] | null;
  best: Source | null;
  inSet: boolean;
  replaces: number | null;
}

export interface FamilyResult {
  family: ImplantFamily;
  grades: GradeResult[];
}

export interface FixResult {
  typeIds: number[];
  cost: number;
  sources: Source[];
  stats: FittingStats;
  headroom: number;
}

export interface GoalSummary {
  goal: ImplantGoal;
  helpers: number;
  used: boolean;
  slots: ReadonlySet<string>;
}

export interface ImplantFinderState {
  status: 'loading' | 'ready' | 'error';
  updating: boolean;
  progress: { done: number; total: number };
  storeProgress: { done: number; total: number } | null;
  catalog: ImplantCatalog | null;
  baseline: FittingStats | null;
  goals: GoalSummary[];
  results: FamilyResult[] | null;
  fixes: FixResult[];
  purchase: ImplantPurchase | null;
  context: GoalContext;
}

interface Input {
  open: boolean;
  fitting: Fitting | null;
  profile: PilotProfile | null;
  goalId: ImplantGoalId | null;
  hubId: TradeHub['id'];
  characterId: number | null;
  target: TargetProfile;
}

type Evaluate = (set: FittingImplantSet) => Promise<FittingStats>;

interface Baselines {
  set: FittingImplantSet;
  stats: FittingStats;
  emptied: Map<string, FittingStats>;
}

export function implantNames(
  families: readonly ImplantFamily[]
): Map<number, { full: string; short: string }> {
  const map = new Map<number, { full: string; short: string }>();
  for (const family of families) {
    for (const grade of family.grades) {
      map.set(grade.typeId, {
        full: !grade.code
          ? family.name
          : family.kind === 'booster'
            ? `${grade.code} ${family.name}`
            : `${family.name} ${grade.code}`,
        short: grade.code ?? family.name,
      });
    }
  }
  return map;
}

export const slotKey = (kind: string, slot: number) => `${kind}:${slot}`;

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

type DamageProfileArg = Parameters<typeof evaluateImplantSet>[2];
type ConditionsArg = Parameters<typeof evaluateImplantSet>[3];

interface FinderMemo {
  profile: PilotProfile;
  damageProfile: DamageProfileArg;
  conditions: ConditionsArg;
  runs: Map<string, Promise<FittingStats>>;
  screened: Map<string, { baselines: Baselines; bestGradeStats: Map<string, FittingStats> }>;
}
const finderMemos = new WeakMap<Fitting, FinderMemo>();

function memoFor(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile: DamageProfileArg,
  conditions: ConditionsArg
): FinderMemo {
  const known = finderMemos.get(fitting);
  if (
    known &&
    known.profile === profile &&
    known.damageProfile === damageProfile &&
    known.conditions === conditions
  ) {
    return known;
  }
  const fresh: FinderMemo = {
    profile,
    damageProfile,
    conditions,
    runs: new Map(),
    screened: new Map(),
  };
  finderMemos.set(fitting, fresh);
  return fresh;
}

function setKey(set: FittingImplantSet): string {
  const sorted = (ids: readonly number[] | undefined) => idSetKey(ids ?? []);
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
  const context = useMemo<GoalContext>(() => ({ target }), [target]);

  const [catalog, setCatalog] = useState<ImplantCatalog | null>(null);
  const [screening, setScreening] = useState<{
    fitting: Fitting;
    baselines: Baselines;
    bestGradeStats: Map<string, FittingStats>;
  } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failed, setFailed] = useState(false);
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
  const [fixRun, setFixRun] = useState<{
    from: object;
    goalId: ImplantGoalId;
    fixes: FixResult[];
  } | null>(null);

  const memo = useMemo(
    () => (fitting && profile ? memoFor(fitting, profile, damageProfile, conditions) : null),
    [fitting, profile, damageProfile, conditions]
  );
  const evaluate = useMemo<Evaluate | null>(() => {
    if (!fitting || !profile || !memo) return null;
    const { runs } = memo;
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
  }, [fitting, profile, damageProfile, conditions, memo]);

  useEffect(() => {
    if (!open || !evaluate || !fitting || !memo) return;
    let cancelled = false;
    void (async () => {
      try {
        const cat = await loadImplantCatalog();
        if (cancelled) return;
        setCatalog(cat);
        const set = fitting.implantSet ?? EMPTY_SET;
        const done = memo.screened.get(setKey(set));
        if (done) {
          setProgress({ done: cat.families.length, total: cat.families.length });
          setScreening({ fitting, ...done });
          setFailed(false);
          return;
        }
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
        memo.screened.set(setKey(set), { baselines, bestGradeStats });
        setScreening({ fitting, baselines, bestGradeStats });
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, evaluate, fitting, memo]);

  const current = screening?.fitting === fitting ? screening : null;

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

  const goals = useMemo<GoalSummary[]>(() => {
    if (!helpersOf || !screening) return [];
    const base = screening.baselines.stats;
    return IMPLANT_GOALS.map((goal) => {
      const helpers = helpersOf(goal);
      return {
        goal,
        helpers: helpers.length,
        used: goal.kind === 'budget' || goal.read(base, context) !== 0,
        slots: new Set(helpers.map((f) => slotKey(f.kind, f.slot))),
      };
    });
  }, [helpersOf, screening, context]);

  const goal = goalId ? goalById(goalId) : null;
  const helping = useMemo(() => (goal && helpersOf ? helpersOf(goal) : []), [goal, helpersOf]);

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

  const helpingTypeIds = useMemo(
    () => helping.flatMap((f) => f.grades.map((g) => g.typeId)).sort((a, b) => a - b),
    [helping]
  );
  const typeIdsKey = helpingTypeIds.join(',');
  const percent = usePricePercentFor('fittings');
  const purchaseKey = `${hubId}|${percent}|${characterId ?? ''}|${typeIdsKey}`;
  useEffect(() => {
    if (!open || typeIdsKey === '') return;
    let cancelled = false;
    const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
    void loadImplantPurchase(
      typeIdsKey.split(',').map(Number),
      hub,
      characterId,
      (done, total) => {
        if (!cancelled) setStoreProgress({ done, total });
      },
      percent
    )
      .then((purchase) => {
        if (!cancelled) setPurchaseRun({ key: purchaseKey, purchase });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStoreProgress(null);
      });
    return () => {
      cancelled = true;
      setStoreProgress(null);
    };
  }, [open, typeIdsKey, hubId, percent, characterId, purchaseKey]);
  const purchase = purchaseRun?.purchase ?? null;

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
          slot: slotKey(r.family.kind, r.family.slot),
          headroomGain: headroomGain(goal, before, g.stats),
          price: g.best?.cost ?? Number.NaN,
        }))
    );
    let cancelled = false;
    void (async () => {
      const confirmed: FixResult[] = [];
      for (const option of cheapestFixes(candidates, needed, FIX_SEARCH)) {
        await yieldToEventLoop();
        if (cancelled) return;
        const stats = await evaluate(
          placeAllInSet(shown.baselines.set, catalog.slotOf, option.typeIds)
        );
        const budget = goal.read(stats);
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
      setFixRun({
        from: shown,
        goalId: goal.id,
        fixes: keepMoreHeadroom(confirmed).slice(0, FIX_LIMIT),
      });
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, evaluate, catalog, goal, shown, results, purchase, fitting]);

  const over = goal?.kind === 'budget' && shown ? shortfall(goal.read(shown.baselines.stats)) : 0;
  const fixes = over > 0 && fixRun?.goalId === goalId ? fixRun.fixes : [];
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
    context,
  };
}
