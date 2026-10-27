/**
 * The hull's role in Improve (scope decision `20261025-*-improve-unlocks-goals-by-hull-role`):
 * which goals a hull is built for, so a blank Retriever can pick Mine more.
 * Roles come from SDE ship groups, with a few hulls named by type id. Pure.
 */
import type { ImproveGoal } from './improve';

export type HullRole = 'combat' | 'mining' | 'logistics' | 'command' | 'hauling';

export const HULL_ROLES: readonly HullRole[] = [
  'combat',
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

/** Hulls whose group says nothing: the Venture (a frigate) and the Nestor (a battleship). */
const ROLE_OF_TYPE: ReadonlyMap<number, HullRole> = new Map([
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

/**
 * The goal to start on for `role`: its own remembered one, else (once, while
 * no role has one) the old global goal if it suits the role, else the role's
 * default.
 */
export function rememberedGoal(
  byRole: GoalsByRole,
  legacy: ImproveGoal,
  role: HullRole
): ImproveGoal {
  const own = byRole[role];
  if (own) return own;
  if (Object.keys(byRole).length === 0 && suits(legacy, role)) return legacy;
  return DEFAULT_GOAL_OF_ROLE[role];
}
