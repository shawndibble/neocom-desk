import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SCOPE_GROUPS } from '@/esi/registry';
import { CORE_GRANT, SCOPES, permissionForScope, scopesForGroup } from '@/esi/scopes';
import { LANDING_SCOPE_GROUPS, PLACED_GROUPS } from './scopeGroups';

describe('LANDING_SCOPE_GROUPS', () => {
  it('places every Permission in exactly one landing group', () => {
    expect([...PLACED_GROUPS].sort()).toEqual([...SCOPE_GROUPS].sort());
  });

  it('places each Core Grant row once', () => {
    const core = LANDING_SCOPE_GROUPS.flatMap(({ rows }) =>
      rows.flatMap((row) => (row.kind === 'core' ? [row.key] : []))
    );
    expect(core.sort()).toEqual(['skills', 'structures']);
  });

  it('represents every scope the app can request, none twice', () => {
    const represented = [...CORE_GRANT, ...PLACED_GROUPS.flatMap((group) => scopesForGroup(group))];
    const everyScope = new Set([...SCOPES, ...SCOPE_GROUPS.flatMap((g) => scopesForGroup(g))]);
    expect(new Set(represented)).toEqual(everyScope);
    expect(represented.length).toBe(everyScope.size);
    for (const scope of represented) {
      const group = permissionForScope(scope);
      if (group !== undefined) expect(PLACED_GROUPS).toContain(group);
    }
  });

  it('only tags as opt-in what the registry marks opt-in', () => {
    expect(PLACED_GROUPS.filter((g) => !PERMISSIONS[g].defaultOn).sort()).toEqual([
      'autopilot',
      'calendarRespond',
      'corp',
      'corpProjects',
      'fittingsWrite',
      'jumpFatigue',
      'killmails',
      'mailOrganize',
      'mailSend',
      'mercenaryDens',
      'openWindow',
      'structureMarkets',
    ]);
  });

  it('puts exactly the six write Permissions in the write group', () => {
    const write = LANDING_SCOPE_GROUPS.find(({ id }) => id === 'write');
    const groups = write?.rows.flatMap((row) => (row.kind === 'group' ? [row.group] : []));
    expect(groups?.sort()).toEqual([
      'autopilot',
      'calendarRespond',
      'fittingsWrite',
      'mailOrganize',
      'mailSend',
      'openWindow',
    ]);
  });
});
