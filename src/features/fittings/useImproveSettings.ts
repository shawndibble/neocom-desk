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

const useImproveGoal = createLocalSetting<ImproveGoal>({
  key: 'fittingsImproveGoal',
  defaultValue: 'overall',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_GOALS as readonly string[]).includes(raw)
      ? (raw as ImproveGoal)
      : 'overall',
});

const useImproveGoalByRole = createLocalSetting<GoalsByRole>({
  key: 'fittingsImproveGoalByRole',
  defaultValue: {},
  parse: (raw) => keepByRole(raw, IMPROVE_GOALS),
});

const useImproveReach = createLocalSetting<ImproveReach>({
  key: 'fittingsImproveReach',
  defaultValue: 'upgrade',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_REACHES as readonly string[]).includes(raw)
      ? (raw as ImproveReach)
      : 'upgrade',
});

const useImproveJob = createLocalSetting<ImproveJob>({
  key: 'fittingsImproveJob',
  defaultValue: DEFAULT_IMPROVE_JOB,
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_JOBS as readonly string[]).includes(raw)
      ? (raw as ImproveJob)
      : DEFAULT_IMPROVE_JOB,
});

const useImproveJobByRole = createLocalSetting<JobsByRole>({
  key: 'fittingsImproveJobByRole',
  defaultValue: {},
  parse: (raw) => keepByRole(raw, IMPROVE_JOBS),
});

const useImproveSpaceByRole = createLocalSetting<SpacesByRole>({
  key: 'fittingsImproveSpaceByRole',
  defaultValue: {},
  parse: (raw) => keepByRole(raw, EXPLORE_SPACES),
});

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

const useImproveSpace = createLocalSetting<ExploreSpace>({
  key: 'fittingsImproveSpace',
  defaultValue: DEFAULT_EXPLORE_SPACE,
  parse: (raw) =>
    typeof raw === 'string' && (EXPLORE_SPACES as readonly string[]).includes(raw)
      ? (raw as ExploreSpace)
      : DEFAULT_EXPLORE_SPACE,
});

const useImproveRigs = createLocalSetting<boolean>({
  key: 'fittingsImproveRigs',
  defaultValue: true,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

const useImproveSort = createLocalSetting<ImproveSort>({
  key: 'fittingsImproveSort',
  defaultValue: 'gain',
  parse: (raw) =>
    typeof raw === 'string' && (IMPROVE_SORTS as readonly string[]).includes(raw)
      ? (raw as ImproveSort)
      : 'gain',
});

const useImproveNoPropulsion = createLocalSetting<boolean>({
  key: 'fittingsImproveNoPropulsion',
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

const DEFAULT_ORE_FAMILY = 'Simple Asteroid';
const useImproveOre = createLocalSetting<string>({
  key: 'fittingsImproveOre',
  defaultValue: DEFAULT_ORE_FAMILY,
  parse: (raw) =>
    typeof raw === 'string' && raw in CRYSTAL_FAMILY_ORES ? raw : DEFAULT_ORE_FAMILY,
});

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

const useImproveBudget = createLocalSetting<number | null>({
  key: 'fittingsImproveBudget',
  defaultValue: null,
  parse: parseCap,
});

const RETIRED_KEYS = ['fittingsImproveMode', 'fittingsImproveRefitCap'];

const LEGACY_SPEND_CAP_KEY = 'fittingsImproveSpendCap';

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

const BY_ROLE = {
  goal: IMPROVE_STORES.goalByRole,
  job: IMPROVE_STORES.jobByRole,
  space: IMPROVE_STORES.spaceByRole,
};
type PerRoleField = keyof typeof BY_ROLE;

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

const FOR_ALL: {
  [K in Exclude<keyof ImproveSettingValues, PerRoleField>]: SettingStore<ImproveSettingValues[K]>;
} = IMPROVE_STORES;

type ValueSetter = {
  getState: () => { value: unknown; setValue: (value: never) => Promise<void> };
};
