/**
 * The hull's role in Improve (scope decision `20261025-*-improve-unlocks-goals-by-hull-role`):
 * which goals a hull is built for, so a blank Retriever can pick Mine more.
 * Roles come from SDE ship groups, with a few hulls named by type id. Pure.
 */
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

/** A hull as the catalogue knows it: its type and its inventory group. */
export interface HullRef {
  typeId: number;
  groupId: number;
}

/** Mining Barge, Exhumer, Expedition Frigate. */
const MINING_GROUPS: readonly number[] = [463, 543, 1283];
/** Logistics Cruiser, Logistics Frigate. */
const LOGISTICS_GROUPS: readonly number[] = [832, 1527];
/** Command Ship, Industrial Command Ship (Orca, Porpoise), Capital Industrial Ship (Rorqual). */
const COMMAND_GROUPS: readonly number[] = [540, 941, 883];
/** Industrial, Freighter, Jump Freighter, Blockade Runner, Deep Space Transport. */
const HAULING_GROUPS: readonly number[] = [28, 513, 902, 1202, 380];

/**
 * Explorer hulls, named by type id (they share the frigate and cruiser groups
 * with combat hulls): Heron, Imicus, Magnate, Probe, Astero, Buzzard, Cheetah,
 * Helios, Anathema, Stratios.
 */
const EXPLORER_TYPES: readonly number[] = [
  605, 607, 29_248, 586, 33_468, 11_192, 11_182, 11_172, 11_188, 33_470,
];

/** Hulls whose group says nothing: the Venture (a frigate) and the Nestor (a battleship). */
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

/** The goals a hull of `role` can pick even when the fit does not yet do the job. */
export const roleUnlocks = (role: HullRole): readonly ImproveGoal[] => UNLOCKS[role];

/** The goal a role starts on when it has none remembered. */
export const DEFAULT_GOAL_OF_ROLE: Record<HullRole, ImproveGoal> = {
  combat: 'overall',
  // Explore better; a fit with no explorer module falls back to Best overall (`searchableGoal`).
  explorer: 'explore',
  mining: 'mining',
  logistics: 'repair',
  command: 'command',
  hauling: 'haul',
};

/** The remembered goal per role; a role not listed has none. */
export type GoalsByRole = Partial<Record<HullRole, ImproveGoal>>;

const roleSpecific = new Set<ImproveGoal>(HULL_ROLES.flatMap((role) => UNLOCKS[role]));

/** Whether the old, global remembered goal belongs to `role` (a role-specific goal to its role, the rest to combat). */
const suits = (goal: ImproveGoal, role: HullRole) =>
  role === 'combat' ? !roleSpecific.has(goal) : UNLOCKS[role].includes(goal);

/** The Improve Job a role starts on when it has none remembered: explorers Explore, every other hull PvE. */
export const DEFAULT_JOB_OF_ROLE: Record<HullRole, ImproveJob> = {
  combat: DEFAULT_IMPROVE_JOB,
  explorer: 'explore',
  mining: DEFAULT_IMPROVE_JOB,
  logistics: DEFAULT_IMPROVE_JOB,
  command: DEFAULT_IMPROVE_JOB,
  hauling: DEFAULT_IMPROVE_JOB,
};

/** The remembered Job per role; a role not listed has none. */
export type JobsByRole = Partial<Record<HullRole, ImproveJob>>;
/** The remembered Explore space per role; a role not listed has none. */
export type SpacesByRole = Partial<Record<HullRole, ExploreSpace>>;

/**
 * How a value remembered per hull role starts on a role with none of its own:
 * whether the old device-wide value (`legacy`) seeds it, and else its default.
 */
export interface RoleMemory<V> {
  seeds: (legacy: V, role: HullRole) => boolean;
  fallback: (role: HullRole) => V;
}

/**
 * The value to start on for `role`: its own remembered one, else (once, while
 * no role has one) the old device-wide value if `memory` lets it seed the role,
 * else the role's default.
 */
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

/** The goal: the old global goal seeds a role it suits (a role-specific goal its role, the rest combat). */
export const GOAL_MEMORY: RoleMemory<ImproveGoal> = {
  seeds: suits,
  fallback: (role) => DEFAULT_GOAL_OF_ROLE[role],
};

/**
 * The Job: the old row seeds a role only if the pilot moved it off the default
 * (a stored default says nothing, so the Astero still opens on Explore) and it
 * suits the role: Explore chosen on an Astero must not open a Drake on Explore.
 */
export const JOB_MEMORY: RoleMemory<ImproveJob> = {
  seeds: (legacy, role) =>
    legacy !== DEFAULT_IMPROVE_JOB &&
    (legacy === 'explore') === (DEFAULT_JOB_OF_ROLE[role] === 'explore'),
  fallback: (role) => DEFAULT_JOB_OF_ROLE[role],
};

/** The Explore space: the old row seeds a role if moved off Dangerous. */
export const SPACE_MEMORY: RoleMemory<ExploreSpace> = {
  seeds: (legacy) => legacy !== DEFAULT_EXPLORE_SPACE,
  fallback: () => DEFAULT_EXPLORE_SPACE,
};
