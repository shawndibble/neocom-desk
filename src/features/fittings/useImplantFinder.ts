/**
 * The implant finder's engine half: tries implants on the open Fitting and
 * prices them, so the modal can say "this one gets you under CPU, for this
 * much, at your hub". Nothing about which implant does what is written
 * down here — each family's best grade is run through the engine against
 * this very fit, and a goal lists only the families that actually move it.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  IMPLANT_GOALS,
  cheapestFixes,
  goalById,
  goalGain,
  groupImplantFamilies,
  headroomGain,
  implantEntriesFromMarket,
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

interface ImplantCatalog {
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
  /** Where to buy it; null when no hub sells it. */
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
  /** The fit with every implant of the option in place. */
  stats: FittingStats;
}

export interface GoalSummary {
  goal: ImplantGoal;
  /** Families that move this goal on this fit. */
  helpers: number;
}

export interface ImplantFinderState {
  status: 'loading' | 'ready' | 'error';
  /** Showing the last results while the fit's new ones are worked out (after an Add). */
  updating: boolean;
  /** How many families have been tried, for a progress line. */
  progress: { done: number; total: number };
  catalog: ImplantCatalog | null;
  /** The fit on its own carried set, as the finder measures from. */
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
  const [screen, setScreen] = useState<{
    fitting: Fitting;
    baseline: FittingStats;
    /** Each family's best grade, run on this fit. */
    top: Map<string, FittingStats>;
  } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failed, setFailed] = useState(false);
  const [graded, setGraded] = useState<{
    key: string;
    fitting: Fitting;
    stats: Map<number, FittingStats>;
    prices: Map<number, HubPrice[]>;
  } | null>(null);
  const [fixStats, setFixStats] = useState<{ key: string; fixes: FixResult[] } | null>(null);

  const implants = fitting?.implantSet?.implants;
  const evaluate = useMemo(
    () =>
      fitting && profile
        ? (set: readonly number[]) =>
            evaluateImplantSet(fitting, profile, damageProfile, conditions, set)
        : null,
    [fitting, profile, damageProfile, conditions]
  );

  // 1. The catalog, then each family's best grade on this fit.
  useEffect(() => {
    if (!open || !evaluate || !fitting) return;
    let cancelled = false;
    void (async () => {
      try {
        const cat = await loadImplantCatalog();
        if (cancelled) return;
        setCatalog(cat);
        const current = implants ?? [];
        const baseline = await evaluate(current);
        const top = new Map<string, FittingStats>();
        setProgress({ done: 0, total: cat.families.length });
        for (const [i, family] of cat.families.entries()) {
          await yieldToEventLoop();
          if (cancelled) return;
          const best = family.grades[family.grades.length - 1]!;
          top.set(family.key, await evaluate(withImplant(current, cat.slotOf, best.typeId)));
          if (i % 16 === 0) setProgress({ done: i + 1, total: cat.families.length });
        }
        if (cancelled) return;
        setProgress({ done: cat.families.length, total: cat.families.length });
        setScreen({ fitting, baseline, top });
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, evaluate, fitting, implants]);

  // The last screen stays up while an edit's new one runs, rather than blanking the window.
  const screenReady = screen !== null;

  const goals = useMemo<GoalSummary[]>(() => {
    if (!screenReady || !catalog) return [];
    return IMPLANT_GOALS.flatMap((goal) => {
      const helpers = catalog.families.filter(
        (f) => goalGain(goal, screen.baseline, screen.top.get(f.key)!) > MIN_GAIN
      ).length;
      return goal.kind === 'budget' || helpers > 0 ? [{ goal, helpers }] : [];
    });
  }, [screenReady, screen, catalog]);

  const goal = goalId ? goalById(goalId) : null;
  const helping = useMemo(() => {
    if (!goal || !screenReady || !catalog) return [];
    return catalog.families.filter(
      (f) => goalGain(goal, screen.baseline, screen.top.get(f.key)!) > MIN_GAIN
    );
  }, [goal, screenReady, screen, catalog]);
  const gradedKey = `${goalId}|${helping.map((f) => f.key).join(',')}`;

  // 2. Every grade of the families that help the selected goal, and their prices at every hub.
  useEffect(() => {
    if (!open || !evaluate || !fitting || !catalog || !screenReady || helping.length === 0) return;
    let cancelled = false;
    void (async () => {
      const current = implants ?? [];
      const stats = new Map<number, FittingStats>();
      const typeIds = helping.flatMap((f) => f.grades.map((g) => g.typeId));
      const pricesPending = hubPrices(typeIds);
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
      if (!cancelled) setGraded({ key: gradedKey, fitting, stats, prices });
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, evaluate, fitting, catalog, screenReady, helping, gradedKey, implants]);

  const results = useMemo<FamilyResult[] | null>(() => {
    if (!goal || !screenReady || !catalog) return null;
    if (helping.length === 0) return [];
    if (!graded || graded.key !== gradedKey) return null;
    const current = implants ?? [];
    return helping
      .map((family) => {
        const grades = family.grades.map((grade) => {
          const stats = graded.stats.get(grade.typeId)!;
          const occupant = current.find((id) => catalog.slotOf(id) === family.slot);
          return {
            grade,
            stats,
            gain: goalGain(goal, screen.baseline, stats),
            source: pickSource(graded.prices.get(grade.typeId) ?? [], hubId),
            inSet: current.includes(grade.typeId),
            replaces: occupant !== undefined && occupant !== grade.typeId ? occupant : null,
          };
        });
        return { family, grades, bestGain: Math.max(...grades.map((g) => g.gain)) };
      })
      .sort((a, b) => b.bestGain - a.bestGain);
  }, [goal, screenReady, screen, catalog, helping, graded, gradedKey, implants, hubId]);

  // 3. Cheapest fixes: searched on each implant's own headroom, then re-run whole to confirm.
  const fixCandidates = useMemo(() => {
    if (!goal || goal.kind !== 'budget' || !results || !screen) return null;
    const needed = shortfall(goal.read(screen.baseline));
    if (needed <= 0) return null;
    const candidates = results.flatMap((r) =>
      r.grades
        .filter((g) => !g.inSet)
        .map((g) => ({
          typeId: g.grade.typeId,
          slot: r.family.slot,
          headroomGain: headroomGain(goal, screen.baseline, g.stats),
          price: g.source?.price ?? Number.NaN,
        }))
    );
    // Search a little wider than shown: stacking penalties can sink an estimate.
    return cheapestFixes(candidates, needed, FIX_LIMIT * 2);
  }, [goal, results, screen]);
  const fixKey = `${gradedKey}|${hubId}|${fixCandidates?.map((f) => f.typeIds.join('+')).join(',')}`;

  useEffect(() => {
    if (!evaluate || !catalog || !goal || goal.kind !== 'budget' || !fixCandidates?.length) return;
    let cancelled = false;
    void (async () => {
      const confirmed: FixResult[] = [];
      for (const option of fixCandidates) {
        await yieldToEventLoop();
        if (cancelled) return;
        let set = implants ?? [];
        for (const id of option.typeIds) set = withImplant(set, catalog.slotOf, id);
        const stats = await evaluate(set);
        if (shortfall(goal.read(stats)) <= 0) {
          confirmed.push({ typeIds: option.typeIds, cost: option.cost, stats });
        }
      }
      if (!cancelled) setFixStats({ key: fixKey, fixes: confirmed.slice(0, FIX_LIMIT) });
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [evaluate, catalog, goal, fixCandidates, fixKey, implants]);

  const fixes = fixCandidates?.length && fixStats?.key === fixKey ? fixStats.fixes : [];

  return {
    status: failed ? 'error' : screenReady ? 'ready' : 'loading',
    updating:
      screen !== null &&
      (screen.fitting !== fitting ||
        (goal !== null && results !== null && graded?.fitting !== fitting && helping.length > 0)),
    progress,
    catalog,
    baseline: screenReady ? screen.baseline : null,
    goals,
    results,
    fixes,
  };
}
