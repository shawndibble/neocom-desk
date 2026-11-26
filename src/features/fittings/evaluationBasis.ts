import { applyImplantBasis, defaultImplantBasis } from '@/engine/fittings/implantBasis';
import type {
  DamageProfile,
  Fitting,
  FittingImplantSet,
  FittingStats,
  PilotProfile,
} from '@/engine/fittings/types';
import { pilotUnder, statsOptions, type StatsConditions } from './statsConditions';
import {
  computeFittingStats,
  type DogmaAssetProgress,
  type DogmaEngine,
  type StatsOptions,
} from './dogmaFittingEngine';
import { NO_SKILL_OVERRIDES, withSkillLevel } from '@/engine/fittings/skillOverrides';
import { allVSkillLevels } from '@/engine/fittings/pilotProfile';
import { raisedSkillLevels } from '@/engine/fittings/moduleUpgrades';
import type { PlanEntry } from '@/engine/types';
import { loadSkills } from '@/sde/loadSde';
import { computeStatsOffThread, skillSourcesOffThread } from './evaluationService';
import type { WorkerSend } from './fittingWorker';

export interface VariantEvaluator {
  fitting: Fitting;
  profile: PilotProfile;
  engine: DogmaEngine;
  compare: (
    variant: Fitting,
    signal?: AbortSignal,
    send?: WorkerSend
  ) => Promise<{ before: FittingStats; after: FittingStats }>;
}

export interface SkillGainEvaluator {
  profile: PilotProfile;
  engine: DogmaEngine;
  skillSources: () => Promise<number[]>;
  compare: (
    skillTypeId: number,
    level: number,
    signal?: AbortSignal
  ) => Promise<{ before: FittingStats; after: FittingStats }>;
  fitting: Fitting;
  compareTrained: (
    variant: Fitting,
    trained: readonly PlanEntry[]
  ) => Promise<{ before: FittingStats; after: FittingStats }>;
}

export interface EvaluationBasis {
  pilot: PilotProfile;
  damageProfile?: DamageProfile;
  conditions: StatsConditions;
}

export async function underBasis<T>(
  { pilot, conditions }: EvaluationBasis,
  calculate: (pilot: PilotProfile, options: StatsOptions) => Promise<T>
): Promise<T> {
  const under = pilotUnder(pilot, conditions);
  return calculate(under instanceof Promise ? await under : under, statsOptions(conditions));
}

export function statsUnder(
  fitting: Fitting,
  basis: EvaluationBasis,
  extra: { overheated?: boolean; onProgress?: (progress: DogmaAssetProgress) => void } = {}
): Promise<FittingStats> {
  return underBasis(basis, (pilot, options) =>
    computeFittingStats(fitting, pilot, extra.onProgress, basis.damageProfile, {
      ...(extra.overheated === undefined ? {} : { overheated: extra.overheated }),
      ...options,
    })
  );
}

export function offThreadStatsUnder(
  fitting: Fitting,
  basis: EvaluationBasis,
  extra: { overheated?: boolean; signal?: AbortSignal; send?: WorkerSend } = {}
): Promise<FittingStats> {
  return underBasis(basis, (pilot, options) =>
    computeStatsOffThread(
      fitting,
      pilot,
      basis.damageProfile,
      {
        ...(extra.overheated === undefined ? {} : { overheated: extra.overheated }),
        ...options,
      },
      extra.signal,
      extra.send
    )
  );
}

export function sharedBaseline(
  fitting: Fitting,
  basis: EvaluationBasis
): () => Promise<FittingStats> {
  let baseline: Promise<FittingStats> | null = null;
  return () => {
    if (baseline === null) {
      const pending = offThreadStatsUnder(fitting, basis, { overheated: false });
      baseline = pending;
      pending.catch(() => {
        if (baseline === pending) baseline = null;
      });
    }
    return baseline;
  };
}

export function variantEvaluator(
  fitting: Fitting,
  basis: EvaluationBasis,
  engine: DogmaEngine,
  baseline: () => Promise<FittingStats>
): VariantEvaluator {
  return {
    fitting,
    profile: basis.pilot,
    engine,
    async compare(variant, signal, send) {
      const [before, after] = await Promise.all([
        baseline(),
        offThreadStatsUnder(variant, basis, {
          overheated: false,
          ...(signal ? { signal } : {}),
          ...(send ? { send } : {}),
        }),
      ]);
      return { before, after };
    },
  };
}

export function skillGainEvaluator(
  fitting: Fitting,
  basis: EvaluationBasis,
  engine: DogmaEngine,
  baseline: () => Promise<FittingStats>
): SkillGainEvaluator {
  return {
    profile: basis.pilot,
    engine,
    async skillSources() {
      const all = await loadSkills();
      const pilot = {
        ...basis.pilot,
        skillLevels: allVSkillLevels(all.map((skill) => skill.typeID)),
      };
      return skillSourcesOffThread(
        fitting,
        pilot,
        basis.damageProfile,
        statsOptions(basis.conditions)
      );
    },
    fitting,
    async compareTrained(variant, trained) {
      const raised = raisedSkillLevels(basis.pilot.skillLevels, trained);
      const skills = trained.reduce(
        (overrides, { skillTypeID }) =>
          withSkillLevel(overrides, skillTypeID, raised.get(skillTypeID) ?? 0),
        basis.conditions.skills ?? NO_SKILL_OVERRIDES
      );
      const [before, after] = await Promise.all([
        baseline(),
        offThreadStatsUnder(
          variant,
          { ...basis, conditions: { ...basis.conditions, skills } },
          { overheated: false }
        ),
      ]);
      return { before, after };
    },
    async compare(skillTypeId, level, signal) {
      const skills = withSkillLevel(
        basis.conditions.skills ?? NO_SKILL_OVERRIDES,
        skillTypeId,
        level
      );
      const [before, after] = await Promise.all([
        baseline(),
        offThreadStatsUnder(
          fitting,
          { ...basis, conditions: { ...basis.conditions, skills } },
          { overheated: false, ...(signal ? { signal } : {}) }
        ),
      ]);
      return { before, after };
    },
  };
}

export function evaluateFitting(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile: DamageProfile | undefined,
  conditions: StatsConditions
): Promise<FittingStats> {
  const pilot = applyImplantBasis(profile, fitting.implantSet, defaultImplantBasis(fitting));
  return offThreadStatsUnder(fitting, {
    pilot,
    conditions,
    ...(damageProfile === undefined ? {} : { damageProfile }),
  });
}

export function evaluateImplantSet(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile: DamageProfile | undefined,
  conditions: StatsConditions,
  set: FittingImplantSet
): Promise<FittingStats> {
  const pilot = applyImplantBasis(profile, set, 'fitting');
  return offThreadStatsUnder(
    fitting,
    { pilot, conditions, ...(damageProfile === undefined ? {} : { damageProfile }) },
    { overheated: false }
  );
}
