import { DAY_MS } from '@/lib/age';

const TAKE_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

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

export function sensitiveRolesOf(roles: readonly string[]): string[] {
  const held = new Set(roles);
  return SENSITIVE_ROLES.filter((role) => held.has(role));
}

export interface RoleHistoryRow {
  changed_at: string;
  character_id: number;
  issuer_id: number;
  role_type: string;
  old_roles: readonly string[];
  new_roles: readonly string[];
}

export interface RoleChange {
  characterId: number;
  issuerId: number;
  changedAtMs: number;
  granted: string[];
  removed: string[];
}

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

export function recentChanges(
  changes: readonly RoleChange[],
  nowMs: number,
  days: number
): RoleChange[] {
  const since = nowMs - days * DAY_MS;
  return changes.filter((change) => change.changedAtMs >= since);
}

export const roleLabel = (role: string): string => role.replace(/_/g, ' ');

export const WIDGET_CHANGE_DAYS = 7;
