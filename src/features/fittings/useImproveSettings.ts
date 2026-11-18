/**
 * The Improve settings remembered on this device: the goal, Job and Explore
 * space per hull role, and Reach, rigs, sort, ore, hold and budget for every
 * hull. `useImproveSettings` reads them back (every store in `IMPROVE_STORES`
 * is hydrated), resolves the per-role ones for the open hull, and writes a
 * change to its own store; the old spend cap is migrated once.
 *
 * A new remembered setting is one store here, keyed by its field, plus its
 * field on `ImproveConfig` (or `ImproveSettingValues`) and its control.
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
  GOAL_MEMORY,
  HULL_ROLES,
  JOB_MEMORY,
  rememberedByRole,
  SPACE_MEMORY,
  type GoalsByRole,
  type HullRole,
  type JobsByRole,
  type SpacesByRole,
} from '@/engine/fittings/improve';
import {
  DEFAULT_EXPLORE_SPACE,
  DEFAULT_IMPROVE_JOB,
  EXPLORE_SPACES,
  IMPROVE_JOBS,
  type ExploreSpace,
  type ImproveJob,
} from '@/engine/fittings/improve';
import { CRYSTAL_FAMILY_ORES } from '@/engine/fittings/crystalChoice';
import { IMPROVE_SORTS, type ImproveSort } from '@/engine/fittings/improve';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { db } from '@/db';
import { isPlainRecord } from '@/engine/guards';
import type { SettingStore } from '@/lib/settingStore';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';
import type { ImproveConfig } from './improveSearch/types';
import type { PerFitField } from './improveSettings';

/**
 * The old global Improve Goal, kept only to seed a role that has none yet
 * (`GOAL_MEMORY`); the goal is now remembered per hull role.
 */
const useImproveGoal = createLocalSetting<ImproveGoal>({
  key: 'fittingsImproveGoal',
  defaultValue: 'overall',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_GOALS as readonly string[]).includes(raw)
      ? (raw as ImproveGoal)
      : 'overall',
});

/** The last Improve Goal per hull role (combat, mining, ...), remembered on this device. */
const useImproveGoalByRole = createLocalSetting<GoalsByRole>({
  key: 'fittingsImproveGoalByRole',
  defaultValue: {},
  parse: (raw) => keepByRole(raw, IMPROVE_GOALS),
});

/** How far Improve goes from the fitted modules, remembered on this device. */
const useImproveReach = createLocalSetting<ImproveReach>({
  key: 'fittingsImproveReach',
  defaultValue: 'upgrade',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_REACHES as readonly string[]).includes(raw)
      ? (raw as ImproveReach)
      : 'upgrade',
});

/** The Improve Job (PvE, PvP, Explore), remembered on this device like Reach; never part of the Fitting. */
const useImproveJob = createLocalSetting<ImproveJob>({
  key: 'fittingsImproveJob',
  defaultValue: DEFAULT_IMPROVE_JOB,
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_JOBS as readonly string[]).includes(raw)
      ? (raw as ImproveJob)
      : DEFAULT_IMPROVE_JOB,
});

/** The last Improve Job per hull role, remembered on this device; the single `fittingsImproveJob` row only seeds a role (`JOB_MEMORY`). */
const useImproveJobByRole = createLocalSetting<JobsByRole>({
  key: 'fittingsImproveJobByRole',
  defaultValue: {},
  parse: (raw) => keepByRole(raw, IMPROVE_JOBS),
});

/** The last Explore space per hull role, remembered on this device; the single `fittingsImproveSpace` row only seeds a role. */
const useImproveSpaceByRole = createLocalSetting<SpacesByRole>({
  key: 'fittingsImproveSpaceByRole',
  defaultValue: {},
  parse: (raw) => keepByRole(raw, EXPLORE_SPACES),
});

/** The entries of a stored role map whose role and value are both known; null for anything not a map. */
function keepByRole<V extends string>(
  raw: unknown,
  allowed: readonly V[]
): Partial<Record<HullRole, V>> | null {
  if (!isPlainRecord(raw)) return null;
  const kept: Partial<Record<HullRole, V>> = {};
  for (const role of HULL_ROLES) {
    const value = raw[role];
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value))
      kept[role] = value as V;
  }
  return kept;
}

/** Where an Explore fit flies (Safe or Dangerous), remembered on this device. */
const useImproveSpace = createLocalSetting<ExploreSpace>({
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
const useImproveRigs = createLocalSetting<boolean>({
  key: 'fittingsImproveRigs',
  defaultValue: true,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

/** How Improve orders each section's rows, remembered on this device. */
const useImproveSort = createLocalSetting<ImproveSort>({
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
const useImproveNoPropulsion = createLocalSetting<boolean>({
  key: 'fittingsImproveNoPropulsion',
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

/** The ore Mine more scores, as its crystal family; remembered on this device. */
const DEFAULT_ORE_FAMILY = 'Simple Asteroid';
const useImproveOre = createLocalSetting<string>({
  key: 'fittingsImproveOre',
  defaultValue: DEFAULT_ORE_FAMILY,
  parse: (raw) =>
    typeof raw === 'string' && raw in CRYSTAL_FAMILY_ORES ? raw : DEFAULT_ORE_FAMILY,
});

/** The hold Carry more scores; remembered on this device. */
const useImproveHold = createLocalSetting<ImproveHold>({
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
const useImproveBudget = createLocalSetting<number | null>({
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

/**
 * Every remembered Improve store, hydrated together by `useImproveSettings`.
 * A setting kept for every hull is keyed by its `ImproveSettingValues` field;
 * a per-role one is its role map and the old device-wide row that seeds it.
 */
export const IMPROVE_STORES = {
  reach: useImproveReach,
  sort: useImproveSort,
  noPropulsion: useImproveNoPropulsion,
  includeRigs: useImproveRigs,
  oreFamily: useImproveOre,
  hold: useImproveHold,
  iskBudget: useImproveBudget,
  goalByRole: useImproveGoalByRole,
  legacyGoal: useImproveGoal,
  jobByRole: useImproveJobByRole,
  legacyJob: useImproveJob,
  spaceByRole: useImproveSpaceByRole,
  legacySpace: useImproveSpace,
};

/** The settings remembered per hull role, by the role map that keeps them. */
const BY_ROLE = {
  goal: IMPROVE_STORES.goalByRole,
  job: IMPROVE_STORES.jobByRole,
  space: IMPROVE_STORES.spaceByRole,
};
type PerRoleField = keyof typeof BY_ROLE;

/** The remembered Improve settings for one hull role: the goal, the row order, and the search's own. */
export type ImproveSettingValues = Omit<ImproveConfig, PerFitField> & {
  goal: ImproveGoal;
  sort: ImproveSort;
};

type ValueStore = {
  getState: () => { value: unknown };
  subscribe: (listener: () => void) => () => void;
};
type StoredValues<R extends Record<string, ValueStore>> = {
  [K in keyof R]: ReturnType<R[K]['getState']>['value'];
};

/** Every store's value, as one object that changes only when one of them does. */
function useStoredValues<R extends Record<string, ValueStore>>(stores: R): StoredValues<R> {
  const last = useRef<StoredValues<R> | null>(null);
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribes = Object.values(stores).map((store) => store.subscribe(listener));
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    [stores]
  );
  const snapshot = () => {
    const keys = Object.keys(stores) as (keyof R)[];
    const prev = last.current;
    if (prev && keys.every((key) => prev[key] === stores[key].getState().value)) return prev;
    const next = Object.fromEntries(
      keys.map((key) => [key, stores[key].getState().value])
    ) as StoredValues<R>;
    last.current = next;
    return next;
  };
  return useSyncExternalStore(subscribe, snapshot);
}

/**
 * The remembered Improve settings for a hull of `role`. `ready` is false until
 * every stored row is read back, so a reload never searches with the defaults;
 * `set` writes each changed field to its store, a per-role one for `role` only
 * (a Hulk does not start on the Drake's More damage).
 */
export function useImproveSettings(role: HullRole): {
  ready: boolean;
  value: ImproveSettingValues;
  set: (patch: Partial<ImproveSettingValues>) => Promise<void>;
} {
  const ready = useHydratedStore(...Object.values(IMPROVE_STORES));
  useEffect(() => {
    void migrateSpendCap();
  }, []);
  const stored = useStoredValues(IMPROVE_STORES);
  const value = useMemo((): ImproveSettingValues => {
    const { goalByRole, legacyGoal, jobByRole, legacyJob, spaceByRole, legacySpace, ...forAll } =
      stored;
    return {
      ...forAll,
      goal: rememberedByRole(goalByRole, legacyGoal, role, GOAL_MEMORY),
      job: rememberedByRole(jobByRole, legacyJob, role, JOB_MEMORY),
      space: rememberedByRole(spaceByRole, legacySpace, role, SPACE_MEMORY),
    };
  }, [stored, role]);
  const set = useCallback(
    async (patch: Partial<ImproveSettingValues>) => {
      const writes = (Object.keys(patch) as (keyof ImproveSettingValues)[]).map((field) => {
        const next = patch[field];
        if (next === undefined) return undefined;
        if (isPerRole(field)) {
          const store: ValueSetter = BY_ROLE[field];
          const byRole = store.getState().value as object;
          return store.getState().setValue({ ...byRole, [role]: next } as never);
        }
        const store: ValueSetter = FOR_ALL[field];
        return store.getState().setValue(next as never);
      });
      await Promise.all(writes);
    },
    [role]
  );
  return { ready, value, set };
}

const isPerRole = (field: keyof ImproveSettingValues): field is PerRoleField => field in BY_ROLE;

/**
 * The stores of the settings kept for every hull, by field. Typed against
 * `ImproveSettingValues`: a field with no store of its type fails to compile.
 */
const FOR_ALL: {
  [K in Exclude<keyof ImproveSettingValues, PerRoleField>]: SettingStore<ImproveSettingValues[K]>;
} = IMPROVE_STORES;

/** A store written with a value already checked by `ImproveSettingValues`. */
type ValueSetter = {
  getState: () => { value: unknown; setValue: (value: never) => Promise<void> };
};
