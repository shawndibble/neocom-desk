/**
 * The Improve settings remembered on this device: the goal and Job per hull
 * role, Reach, Explore space, rigs, sort, ore, hold and budget, how they are
 * read back after a reload, and the one-off migration of the old spend cap.
 */
import {
  DEFAULT_IMPROVE_HOLD,
  IMPROVE_GOALS,
  IMPROVE_HOLDS,
  IMPROVE_REACHES,
  type ImproveGoal,
  type ImproveHold,
  type ImproveReach,
} from '@/engine/fittings/improve';
import {
  HULL_ROLES,
  type GoalsByRole,
  type HullRole,
  type JobsByRole,
  type SpacesByRole,
} from '@/engine/fittings/improveRole';
import {
  DEFAULT_EXPLORE_SPACE,
  DEFAULT_IMPROVE_JOB,
  EXPLORE_SPACES,
  IMPROVE_JOBS,
  type ExploreSpace,
  type ImproveJob,
} from '@/engine/fittings/improveJob';
import { CRYSTAL_FAMILY_ORES } from '@/engine/fittings/crystalChoice';
import { IMPROVE_SORTS, type ImproveSort } from '@/engine/fittings/improveRows';
import { db } from '@/db';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';

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

/** How far Improve goes from the fitted modules, remembered on this device. */
export const useImproveReach = createLocalSetting<ImproveReach>({
  key: 'fittingsImproveReach',
  defaultValue: 'upgrade',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_REACHES as readonly string[]).includes(raw)
      ? (raw as ImproveReach)
      : 'upgrade',
});

/** The Improve Job (PvE, PvP, Explore), remembered on this device like Reach; never part of the Fitting. */
export const useImproveJob = createLocalSetting<ImproveJob>({
  key: 'fittingsImproveJob',
  defaultValue: DEFAULT_IMPROVE_JOB,
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_JOBS as readonly string[]).includes(raw)
      ? (raw as ImproveJob)
      : DEFAULT_IMPROVE_JOB,
});

/** The last Improve Job per hull role, remembered on this device; the single `fittingsImproveJob` row only seeds a role (`rememberedJob`). */
export const useImproveJobByRole = createLocalSetting<JobsByRole>({
  key: 'fittingsImproveJobByRole',
  defaultValue: {},
  parse: (raw) => keepByRole(raw, IMPROVE_JOBS),
});

/** The last Explore space per hull role, remembered on this device; the single `fittingsImproveSpace` row only seeds a role. */
export const useImproveSpaceByRole = createLocalSetting<SpacesByRole>({
  key: 'fittingsImproveSpaceByRole',
  defaultValue: {},
  parse: (raw) => keepByRole(raw, EXPLORE_SPACES),
});

/** The entries of a stored role map whose role and value are both known; null for anything not a map. */
function keepByRole<V extends string>(
  raw: unknown,
  allowed: readonly V[]
): Partial<Record<HullRole, V>> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const values = raw as Record<string, unknown>;
  const kept: Partial<Record<HullRole, V>> = {};
  for (const role of HULL_ROLES) {
    const value = values[role];
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value))
      kept[role] = value as V;
  }
  return kept;
}

/** Where an Explore fit flies (Safe or Dangerous), remembered on this device. */
export const useImproveSpace = createLocalSetting<ExploreSpace>({
  key: 'fittingsImproveSpace',
  defaultValue: DEFAULT_EXPLORE_SPACE,
  parse: (raw) =>
    typeof raw === 'string' && (EXPLORE_SPACES as readonly string[]).includes(raw)
      ? (raw as ExploreSpace)
      : DEFAULT_EXPLORE_SPACE,
});

/**
 * Whether rigs are searched: on until the pilot unticks it. The old drawer kept
 * the tick for the session only and defaulted it off, so no stored row says "off"
 * by default; this key is new and holds a value only once the pilot has chosen it.
 */
export const useImproveRigs = createLocalSetting<boolean>({
  key: 'fittingsImproveRigs',
  defaultValue: true,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
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

/**
 * PvE needs a propulsion module, and a Makeover adds one when the fit has none; this opts out
 * (a bastioned Marauder never moves). Off until the pilot ticks it, remembered on this device (#5578).
 */
export const useImproveNoPropulsion = createLocalSetting<boolean>({
  key: 'fittingsImproveNoPropulsion',
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
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

/**
 * Reads every remembered Improve setting back from this device; true once all
 * have settled. Nothing else hydrates them, so without it each starts at its
 * default after a reload and the stored row is never read.
 */
export function useImproveSettingsHydrated(): boolean {
  return useHydratedStore(
    useImproveGoal,
    useImproveGoalByRole,
    useImproveReach,
    useImproveJob,
    useImproveJobByRole,
    useImproveSpace,
    useImproveSpaceByRole,
    useImproveRigs,
    useImproveNoPropulsion,
    useImproveSort,
    useImproveOre,
    useImproveHold,
    useImproveBudget
  );
}

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
