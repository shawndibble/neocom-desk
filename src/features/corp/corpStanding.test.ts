import { describe, expect, it } from 'vitest';
import {
  CORP_STANDING_SCOPES,
  alertsWhenClosedRank,
  corpAccessRank,
  corpRolesRank,
  corpStanding,
} from './corpStanding';
import { CORP_SCOPES_FOR_CAPABILITY } from './corpScopes';

const EVERY_CORP_SCOPE = [...new Set(Object.values(CORP_SCOPES_FOR_CAPABILITY).flat())];

describe('corpStanding', () => {
  it('a Director with the full grant holds Director and is ready', () => {
    expect(
      corpStanding({
        rolesScopeGranted: true,
        roles: ['Director'],
        grantedScopes: EVERY_CORP_SCOPE,
      })
    ).toEqual({ kind: 'roles', roles: ['Director'], missingScopes: 0 });
  });

  it('a role holder missing a scope counts the missing scopes', () => {
    const granted = EVERY_CORP_SCOPE.filter(
      (scope) => scope !== 'esi-industry.read_corporation_jobs.v1'
    );
    expect(
      corpStanding({ rolesScopeGranted: true, roles: ['Factory_Manager'], grantedScopes: granted })
    ).toEqual({ kind: 'roles', roles: ['Factory_Manager'], missingScopes: 1 });
  });

  it('is not granted when the roles scope is missing, whatever else is held', () => {
    expect(
      corpStanding({ rolesScopeGranted: false, roles: null, grantedScopes: EVERY_CORP_SCOPE })
    ).toEqual({ kind: 'notGranted' });
  });

  it('is none for a Character with no capability role', () => {
    expect(corpStanding({ rolesScopeGranted: true, roles: [], grantedScopes: [] })).toEqual({
      kind: 'none',
    });
  });

  it('lists only the roles that give a Corp Capability, sorted for display', () => {
    expect(
      corpStanding({
        rolesScopeGranted: true,
        roles: ['Station_Manager', 'Hangar_Take_1', 'Accountant'],
        grantedScopes: EVERY_CORP_SCOPE,
      })
    ).toEqual({ kind: 'roles', roles: ['Accountant', 'Station_Manager'], missingScopes: 0 });
    expect(
      corpStanding({ rolesScopeGranted: true, roles: ['Hangar_Take_1'], grantedScopes: [] })
    ).toEqual({ kind: 'none' });
  });

  it('is unknown while the roles have not been read', () => {
    expect(
      corpStanding({ rolesScopeGranted: true, roles: null, grantedScopes: EVERY_CORP_SCOPE })
    ).toBeUndefined();
  });
});

describe('CORP_STANDING_SCOPES', () => {
  it('covers the roles scope and every scope a capability needs', () => {
    expect(CORP_STANDING_SCOPES).toContain('esi-characters.read_corporation_roles.v1');
    for (const scope of EVERY_CORP_SCOPE) expect(CORP_STANDING_SCOPES).toContain(scope);
  });
});

describe('sort ranks put the gaps first (ascending)', () => {
  it('roles: not granted, then role holders, then no role', () => {
    const notGranted = corpRolesRank({ kind: 'notGranted' });
    const holder = corpRolesRank({ kind: 'roles', roles: ['Director'], missingScopes: 0 });
    const none = corpRolesRank({ kind: 'none' });
    expect(notGranted).toBeLessThan(holder as number);
    expect(holder).toBeLessThan(none as number);
    expect(corpRolesRank(undefined)).toBeUndefined();
  });

  it('access: not granted, then most missing, then ready, then no role', () => {
    const notGranted = corpAccessRank({ kind: 'notGranted' }) as number;
    const missingTwo = corpAccessRank({
      kind: 'roles',
      roles: ['Director'],
      missingScopes: 2,
    }) as number;
    const missingOne = corpAccessRank({
      kind: 'roles',
      roles: ['Director'],
      missingScopes: 1,
    }) as number;
    const ready = corpAccessRank({
      kind: 'roles',
      roles: ['Director'],
      missingScopes: 0,
    }) as number;
    const none = corpAccessRank({ kind: 'none' }) as number;
    expect([notGranted, missingTwo, missingOne, ready, none]).toEqual(
      [notGranted, missingTwo, missingOne, ready, none].sort((a, b) => a - b)
    );
    expect(new Set([notGranted, missingTwo, missingOne, ready, none]).size).toBe(5);
  });

  it('alerts: needs re-authorizing, then off, then on', () => {
    expect(alertsWhenClosedRank('needs-reauth')).toBeLessThan(alertsWhenClosedRank('off'));
    expect(alertsWhenClosedRank('off')).toBeLessThan(alertsWhenClosedRank('on'));
  });
});
