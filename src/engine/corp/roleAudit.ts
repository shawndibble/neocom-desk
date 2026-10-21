/**
 * Corp role audit (issue #4613): which roles are sensitive, and what a role
 * history row means for them. Pure; plain strings and numbers in, no ESI import
 * (the row shape below mirrors `CorporationRoleHistory`).
 */
import { DAY_MS } from '@/lib/age';

const TAKE_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * The roles an audit cares about, fixed (no per-corp config): the ones that open
 * money, people, structures or hangar contents. The "view" and "query" roles are
 * not here. Display order: Director first.
 */
export const SENSITIVE_ROLES: readonly string[] = [
  'Director',
  'Accountant',
  'Junior_Accountant',
  'Personnel_Manager',
  'Station_Manager',
  'Trader',
  'Security_Officer',
  ...TAKE_DIVISIONS.map((n) => `Hangar_Take_${n}`),
  ...TAKE_DIVISIONS.map((n) => `Container_Take_${n}`),
];

const SENSITIVE = new Set(SENSITIVE_ROLES);

export const isSensitiveRole = (role: string): boolean => SENSITIVE.has(role);

/** A member's sensitive roles, in `SENSITIVE_ROLES` order. */
export function sensitiveRolesOf(roles: readonly string[]): string[] {
  const held = new Set(roles);
  return SENSITIVE_ROLES.filter((role) => held.has(role));
}

/** One row of `GET /corporations/{id}/roles/history`. */
export interface RoleHistoryRow {
  changed_at: string;
  character_id: number;
  issuer_id: number;
  role_type: string;
  old_roles: readonly string[];
  new_roles: readonly string[];
}

/** A change to a member's corporation-wide sensitive roles. */
export interface RoleChange {
  characterId: number;
  issuerId: number;
  changedAtMs: number;
  granted: string[];
  removed: string[];
}

/**
 * Sensitive grants and removals, newest first. Only the corporation-wide
 * `roles` type counts: office-scoped and grantable changes open nothing
 * corporation-wide. A row that changes no sensitive role, or has no usable
 * date, is dropped.
 */
export function toRoleChanges(rows: readonly RoleHistoryRow[]): RoleChange[] {
  const changes: RoleChange[] = [];
  for (const row of rows) {
    if (row.role_type !== 'roles') continue;
    const changedAtMs = Date.parse(row.changed_at);
    if (Number.isNaN(changedAtMs)) continue;
    const before = new Set(row.old_roles);
    const after = new Set(row.new_roles);
    const granted = sensitiveRolesOf(row.new_roles.filter((role) => !before.has(role)));
    const removed = sensitiveRolesOf(row.old_roles.filter((role) => !after.has(role)));
    if (granted.length === 0 && removed.length === 0) continue;
    changes.push({
      characterId: row.character_id,
      issuerId: row.issuer_id,
      changedAtMs,
      granted,
      removed,
    });
  }
  return changes.sort((a, b) => b.changedAtMs - a.changedAtMs);
}

/** Changes from the last `days` days. */
export function recentChanges(
  changes: readonly RoleChange[],
  nowMs: number,
  days: number
): RoleChange[] {
  const since = nowMs - days * DAY_MS;
  return changes.filter((change) => change.changedAtMs >= since);
}

/** "Personnel_Manager" as "Personnel Manager". */
export const roleLabel = (role: string): string => role.replace(/_/g, ' ');

/** The role-history window the widget counts, in days. */
export const WIDGET_CHANGE_DAYS = 7;
