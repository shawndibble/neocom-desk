/**
 * "What to train" for a Tech II module: each fitted Tech I module with a
 * Tech II sibling the pilot can't fly yet (`engine/fittings/moduleUpgrades.ts`),
 * worked out with every copy swapped and the whole schedule that unlocks it
 * trained — prerequisites included, since the pilot will have trained those
 * too. Kept only when the upgraded fit still fits its CPU, powergrid and
 * calibration and comes out better overall. The requirements come from the
 * engine's own fitting rules, so nothing goes to ESI. Keyed on its inputs
 * like `useSkillGains`, so a Fitting or Character change mid-way never
 * shows the old fit's rows.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  evaluateModuleUpgrades,
  moduleUpgradeCandidates,
  type ModuleUpgradeGain,
} from '@/engine/fittings/moduleUpgrades';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { levelGain, type LevelGain } from '@/engine/fittings/skillGains';
import { fitsResourceBudget } from '@/engine/fittings/skillGaps';
import { buildVariationIndex } from '@/engine/market/variations';
import type { PlanEntry, ScheduledStep } from '@/engine/types';
import { loadDogmaEngine, moduleSkillRequirements } from './dogmaFittingEngine';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

export type ModuleUpgradeRow = ModuleUpgradeGain<LevelGain, ScheduledStep>;

export interface ModuleUpgradesState {
  /** Null while working out (or with nothing to work from); in fit order — the panel ranks them. */
  rows: ModuleUpgradeRow[] | null;
  loading: boolean;
}

/** Schedules `entries` at the Character's attributes; null until the Character's skills are in. */
export type ScheduleEntries = (entries: readonly PlanEntry[]) => readonly ScheduledStep[] | null;

interface Computed {
  evaluator: SkillGainEvaluator;
  catalogue: FittingCatalogue;
  schedule: ScheduleEntries;
  rows: ModuleUpgradeRow[];
}

export function useModuleUpgrades(
  evaluator: SkillGainEvaluator | null,
  catalogue: FittingCatalogue | null,
  schedule: ScheduleEntries | null
): ModuleUpgradesState {
  const index = useMemo(
    () =>
      catalogue
        ? buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups)
        : null,
    [catalogue]
  );
  const [computed, setComputed] = useState<Computed | null>(null);

  useEffect(() => {
    if (!evaluator || !catalogue || !index || !schedule) return;
    let cancelled = false;
    void (async () => {
      const { fitting, profile } = evaluator;
      try {
        await loadDogmaEngine();
      } catch {
        // The ranking above already says the engine failed; this list stays empty.
        if (!cancelled) setComputed({ evaluator, catalogue, schedule, rows: [] });
        return;
      }
      const rows = await evaluateModuleUpgrades(
        moduleUpgradeCandidates(fitting.modules, index, catalogue.rackOf),
        {
          fitting,
          levels: profile.skillLevels,
          requirements: (typeId, rack) =>
            moduleSkillRequirements(fitting.shipTypeId, rack as CandidateRack, typeId),
          schedule,
          compare: evaluator.compareTrained,
          gain: levelGain,
          fits: fitsResourceBudget,
          // One swap at a time, as `useSkillGains` does: each is a synchronous
          // engine calculation, and run together they'd freeze input.
          between: yieldToEventLoop,
          cancelled: () => cancelled,
        }
      );
      if (rows === null || cancelled) return;
      setComputed({ evaluator, catalogue, schedule, rows });
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluator, catalogue, index, schedule]);

  if (!evaluator || !catalogue || !schedule) return { rows: null, loading: false };
  const fresh =
    computed?.evaluator === evaluator &&
    computed.catalogue === catalogue &&
    computed.schedule === schedule
      ? computed
      : null;
  return { rows: fresh?.rows ?? null, loading: fresh === null };
}
