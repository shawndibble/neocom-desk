/**
 * What a Fitting is worked out under (`EvaluationBasis`) and the calculations
 * built on it: the open Fitting's stats, off-thread stats for every other
 * evaluation, Variations' and "What to train"'s evaluators, and the one-shot
 * `evaluateFitting` / `evaluateImplantSet`. `useFittingEvaluation` wires them
 * to React state; nothing here touches React.
 */
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

/**
 * Changes to the open Fitting (Variations' swap candidates), worked out
 * under exactly what its own stats are. One object per open Fitting, pilot
 * and Damage Profile, so the open Fitting's baseline is worked out once
 * however many variants are compared.
 */
export interface VariantEvaluator {
  /** The open Fitting the variants are changes to. */
  fitting: Fitting;
  /** The pilot the stats run under — skills for fit checks on the candidates. */
  profile: PilotProfile;
  /** The ready engine, for the candidates' synchronous fit checks. */
  engine: DogmaEngine;
  /**
   * A variant's stats beside the open Fitting's own, both without overheat.
   * Worked out off the main thread; `signal` drops the variant's own
   * calculation if the caller moves on. `send` runs it on a search's own
   * worker pool instead of the shared worker.
   */
  compare: (
    variant: Fitting,
    signal?: AbortSignal,
    send?: WorkerSend
  ) => Promise<{ before: FittingStats; after: FittingStats }>;
}

/**
 * "What to train" for the open Fitting (`useSkillGains`): the open Fitting
 * with one skill at another level, beside its own stats — the same cached
 * baseline Variations compares against.
 */
export interface SkillGainEvaluator {
  /** The pilot the stats run under; its skill levels are the ones a +1 builds on. */
  profile: PilotProfile;
  /** The ready engine, for a module upgrade's skill requirements. */
  engine: DogmaEngine;
  /** Every skill that modifies anything on the Fitting, found with every skill at V. */
  skillSources: () => Promise<number[]>;
  /**
   * The Fitting's stats with `skillTypeId` at `level`, beside its own, both
   * without overheat. `signal` drops the calculation if the caller moves on.
   */
  compare: (
    skillTypeId: number,
    level: number,
    signal?: AbortSignal
  ) => Promise<{ before: FittingStats; after: FittingStats }>;
  /** The open Fitting — what a module upgrade swaps modules on. */
  fitting: Fitting;
  /**
   * `variant`'s stats once `trained` is — each skill at least its level, none
   * lowered — beside the open Fitting's own, both without overheat.
   */
  compareTrained: (
    variant: Fitting,
    trained: readonly PlanEntry[]
  ) => Promise<{ before: FittingStats; after: FittingStats }>;
}

/**
 * What a Fitting is worked out under, beside the Fitting itself: the pilot
 * (skills, and the implants the basis picked), the Damage Profile and the
 * session's conditions. One object, so every calculation below takes the
 * same three together and none can forget one.
 */
export interface EvaluationBasis {
  pilot: PilotProfile;
  /** Absent: the engine's uniform default. */
  damageProfile?: DamageProfile;
  conditions: StatsConditions;
}

/**
 * Runs `calculate` with the basis's pilot under its skill overrides and the
 * engine options its conditions ask for. `pilotUnder` is awaited only when
 * it hands back a Promise (All V loads the skill list): otherwise `calculate`
 * starts in the same tick, as it did before overrides existed.
 */
export async function underBasis<T>(
  { pilot, conditions }: EvaluationBasis,
  calculate: (pilot: PilotProfile, options: StatsOptions) => Promise<T>
): Promise<T> {
  const under = pilotUnder(pilot, conditions);
  return calculate(under instanceof Promise ? await under : under, statsOptions(conditions));
}

/** `fitting`'s stats under `basis`; `extra` adds engine options (no overheat) or a progress callback. */
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

/**
 * `statsUnder` off the main thread (`evaluationService`): for every
 * evaluation that comes in numbers — a Variations sibling, a skill level, a
 * Compare row — rather than the open Fitting's own stats, which the page
 * works out itself so it can report the engine's download progress.
 */
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

/** `fitting`'s own stats without overheat, worked out once on first ask and shared by every compare. */
export function sharedBaseline(
  fitting: Fitting,
  basis: EvaluationBasis
): () => Promise<FittingStats> {
  // Dropped on failure so a transient error doesn't wedge every later compare.
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
      // At V, so an untrained skill — which the engine gives no modifiers —
      // is still found when it would change something.
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

/**
 * A Fitting other than the open one (Fitting Compare, the applied-DPS
 * overlay), on the basis it would open on: its own carried set when it
 * carries one, else the pilot's clone — under the same conditions as the
 * open one (`useStatsConditions`, passed in so a caller re-runs when they change).
 */
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

/**
 * `fitting` with `set`'s implants and boosters in place of its own carried
 * ones, without overheat — the Implant Finder's "what would this do" run.
 * Always on the Fitting's own set, since that is what the finder adds to,
 * whichever basis the page shows.
 */
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
