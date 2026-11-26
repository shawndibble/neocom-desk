import { useEffect, useMemo, useState } from 'react';
import {
  evaluateModuleUpgrades,
  moduleUpgradeCandidates,
  type ModuleUpgradeGain,
} from '@/engine/fittings/moduleUpgrades';
import { levelGain, type LevelGain } from '@/engine/fittings/skillGains';
import { fitsResourceBudget } from '@/engine/fittings/skillGaps';
import { buildVariationIndex } from '@/engine/market/variations';
import type { PlanEntry, ScheduledStep } from '@/engine/types';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

export type ModuleUpgradeRow = ModuleUpgradeGain<LevelGain, ScheduledStep>;

export interface ModuleUpgradesState {
  rows: ModuleUpgradeRow[] | null;
  loading: boolean;
}

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
      const { fitting, profile, engine } = evaluator;
      const rows = await evaluateModuleUpgrades(
        moduleUpgradeCandidates(fitting.modules, index, catalogue.rackOf),
        {
          fitting,
          levels: profile.skillLevels,
          requirements: (typeId, rack) =>
            engine.moduleSkillRequirements(fitting.shipTypeId, rack, typeId),
          schedule,
          compare: evaluator.compareTrained,
          gain: levelGain,
          fits: fitsResourceBudget,
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
