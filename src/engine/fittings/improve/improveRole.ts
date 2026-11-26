import type { ImproveGoal } from './improve';
import {
  DEFAULT_EXPLORE_SPACE,
  DEFAULT_IMPROVE_JOB,
  type ExploreSpace,
  type ImproveJob,
} from './improveJob';

export type HullRole = 'combat' | 'explorer' | 'mining' | 'logistics' | 'command' | 'hauling';

export const HULL_ROLES: readonly HullRole[] = [
  'combat',
  'explorer',
  'mining',
  'logistics',
  'command',
  'hauling',
];

export interface HullRef {
  typeId: number;
  groupId: number;
}

const MINING_GROUPS: readonly number[] = [463, 543, 1283];
const LOGISTICS_GROUPS: readonly number[] = [832, 1527];
const COMMAND_GROUPS: readonly number[] = [540, 941, 883];
const HAULING_GROUPS: readonly number[] = [28, 513, 902, 1202, 380];

const EXPLORER_TYPES: readonly number[] = [
  605, 607, 29_248, 586, 33_468, 11_192, 11_182, 11_172, 11_188, 33_470,
];

const ROLE_OF_TYPE: ReadonlyMap<number, HullRole> = new Map([
  ...EXPLORER_TYPES.map((id): [number, HullRole] => [id, 'explorer']),
  [32_880, 'mining'],
  [33_472, 'logistics'],
]);

export function hullRoleOf(hull: HullRef | undefined): HullRole {
  if (!hull) return 'combat';
  const named = ROLE_OF_TYPE.get(hull.typeId);
  if (named) return named;
  if (MINING_GROUPS.includes(hull.groupId)) return 'mining';
  if (LOGISTICS_GROUPS.includes(hull.groupId)) return 'logistics';
  if (COMMAND_GROUPS.includes(hull.groupId)) return 'command';
  if (HAULING_GROUPS.includes(hull.groupId)) return 'hauling';
  return 'combat';
}

const UNLOCKS: Record<HullRole, readonly ImproveGoal[]> = {
  combat: [],
  explorer: [],
  mining: ['mining'],
  logistics: ['repair', 'transfer'],
  command: ['command'],
  hauling: ['haul'],
};

export const roleUnlocks = (role: HullRole): readonly ImproveGoal[] => UNLOCKS[role];

export const DEFAULT_GOAL_OF_ROLE: Record<HullRole, ImproveGoal> = {
  combat: 'overall',
  explorer: 'explore',
  mining: 'mining',
  logistics: 'repair',
  command: 'command',
  hauling: 'haul',
};

export type GoalsByRole = Partial<Record<HullRole, ImproveGoal>>;

const roleSpecific = new Set<ImproveGoal>(HULL_ROLES.flatMap((role) => UNLOCKS[role]));

const suits = (goal: ImproveGoal, role: HullRole) =>
  role === 'combat' ? !roleSpecific.has(goal) : UNLOCKS[role].includes(goal);

export const DEFAULT_JOB_OF_ROLE: Record<HullRole, ImproveJob> = {
  combat: DEFAULT_IMPROVE_JOB,
  explorer: 'explore',
  mining: DEFAULT_IMPROVE_JOB,
  logistics: DEFAULT_IMPROVE_JOB,
  command: DEFAULT_IMPROVE_JOB,
  hauling: DEFAULT_IMPROVE_JOB,
};

export type JobsByRole = Partial<Record<HullRole, ImproveJob>>;
export type SpacesByRole = Partial<Record<HullRole, ExploreSpace>>;

export interface RoleMemory<V> {
  seeds: (legacy: V, role: HullRole) => boolean;
  fallback: (role: HullRole) => V;
}

export function rememberedByRole<V>(
  byRole: Partial<Record<HullRole, NoInfer<V>>>,
  legacy: NoInfer<V>,
  role: HullRole,
  memory: RoleMemory<V>
): V {
  const own = byRole[role];
  if (own !== undefined) return own;
  if (Object.keys(byRole).length === 0 && memory.seeds(legacy, role)) return legacy;
  return memory.fallback(role);
}

export const GOAL_MEMORY: RoleMemory<ImproveGoal> = {
  seeds: suits,
  fallback: (role) => DEFAULT_GOAL_OF_ROLE[role],
};

export const JOB_MEMORY: RoleMemory<ImproveJob> = {
  seeds: (legacy, role) =>
    legacy !== DEFAULT_IMPROVE_JOB &&
    (legacy === 'explore') === (DEFAULT_JOB_OF_ROLE[role] === 'explore'),
  fallback: (role) => DEFAULT_JOB_OF_ROLE[role],
};

export const SPACE_MEMORY: RoleMemory<ExploreSpace> = {
  seeds: (legacy) => legacy !== DEFAULT_EXPLORE_SPACE,
  fallback: () => DEFAULT_EXPLORE_SPACE,
};
