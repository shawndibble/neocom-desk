import { describe, expect, it } from 'vitest';
import {
  SENSITIVE_ROLES,
  isSensitiveRole,
  recentChanges,
  sensitiveRolesOf,
  toRoleChanges,
  type RoleHistoryRow,
} from './roleAudit';

const row = (over: Partial<RoleHistoryRow>): RoleHistoryRow => ({
  changed_at: '2026-10-20T10:00:00Z',
  character_id: 1,
  issuer_id: 2,
  role_type: 'roles',
  old_roles: [],
  new_roles: [],
  ...over,
});

describe('sensitive roles', () => {
  it('covers the fixed list and the hangar and container take roles', () => {
    for (const role of [
      'Director',
      'Accountant',
      'Junior_Accountant',
      'Personnel_Manager',
      'Station_Manager',
      'Trader',
      'Security_Officer',
      'Hangar_Take_1',
      'Hangar_Take_7',
      'Container_Take_3',
    ])
      expect(isSensitiveRole(role)).toBe(true);
    expect(SENSITIVE_ROLES).toHaveLength(7 + 14);
  });

  it('leaves out view and query roles and unknown strings', () => {
    for (const role of ['Hangar_Query_1', 'Auditor', 'Account_Take_1', 'Mystery'])
      expect(isSensitiveRole(role)).toBe(false);
  });

  it('keeps a member sensitive roles in list order and drops the rest', () => {
    expect(sensitiveRolesOf(['Trader', 'Auditor', 'Director', 'Hangar_Take_2'])).toEqual([
      'Director',
      'Trader',
      'Hangar_Take_2',
    ]);
  });
});

describe('toRoleChanges', () => {
  it('reports sensitive grants and removals only', () => {
    const changes = toRoleChanges([
      row({ old_roles: ['Auditor'], new_roles: ['Auditor', 'Director', 'Diplomat'] }),
      row({ character_id: 3, old_roles: ['Trader', 'Diplomat'], new_roles: ['Diplomat'] }),
    ]);
    expect(changes).toEqual([
      expect.objectContaining({ characterId: 1, granted: ['Director'], removed: [] }),
      expect.objectContaining({ characterId: 3, granted: [], removed: ['Trader'] }),
    ]);
  });

  it('skips non-sensitive changes and every role type but the corporation-wide one', () => {
    expect(
      toRoleChanges([
        row({ new_roles: ['Diplomat'] }),
        row({ role_type: 'roles_at_hq', new_roles: ['Director'] }),
        row({ role_type: 'grantable_roles', new_roles: ['Director'] }),
      ])
    ).toEqual([]);
  });

  it('sorts newest first and drops an unparseable date', () => {
    const changes = toRoleChanges([
      row({ changed_at: '2026-10-01T00:00:00Z', new_roles: ['Director'] }),
      row({ changed_at: 'nope', new_roles: ['Director'] }),
      row({ changed_at: '2026-10-10T00:00:00Z', new_roles: ['Trader'] }),
    ]);
    expect(changes.map((c) => c.changedAtMs)).toEqual([
      Date.parse('2026-10-10T00:00:00Z'),
      Date.parse('2026-10-01T00:00:00Z'),
    ]);
  });
});

describe('recentChanges', () => {
  it('keeps changes inside the window', () => {
    const now = Date.parse('2026-10-20T00:00:00Z');
    const changes = toRoleChanges([
      row({ changed_at: '2026-10-19T00:00:00Z', new_roles: ['Director'] }),
      row({ changed_at: '2026-10-05T00:00:00Z', new_roles: ['Director'] }),
    ]);
    expect(recentChanges(changes, now, 7)).toHaveLength(1);
    expect(recentChanges(changes, now, 30)).toHaveLength(2);
  });
});
