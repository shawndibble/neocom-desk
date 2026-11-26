import { describe, it, expect } from 'vitest';
import {
  CORE_GRANT,
  SCOPES,
  permissionForScope,
  isPermissionGranted,
  revokedScopes,
  scopesForGroup,
} from './scopes';
import {
  ESI_REGISTRY,
  PERMISSIONS,
  PUBLIC,
  SCOPE_GROUPS,
  WRITE_GROUPS,
  isScopeRequired,
  type EsiEndpointSpec,
} from './registry';

const specs: readonly EsiEndpointSpec[] = Object.values(ESI_REGISTRY);

const WRITE_SCOPES = [
  'esi-mail.send_mail.v1',
  'esi-mail.organize_mail.v1',
  'esi-calendar.respond_calendar_events.v1',
  'esi-fittings.write_fittings.v1',
  'esi-ui.write_waypoint.v1',
  'esi-ui.open_window.v1',
];

const DEFAULT_ON_GROUPS = SCOPE_GROUPS.filter((group) => PERMISSIONS[group].defaultOn);
const OPT_IN_GROUPS = SCOPE_GROUPS.filter((group) => !PERMISSIONS[group].defaultOn);

describe('CORE_GRANT', () => {
  it('lists exactly the Core Grant scopes', () => {
    expect([...CORE_GRANT].sort()).toEqual(
      [
        'esi-skills.read_skills.v1',
        'esi-skills.read_skillqueue.v1',
        'esi-universe.read_structures.v1',
        'esi-search.search_structures.v1',
      ].sort()
    );
  });

  it('covers every scope an endpoint with no Permission requires', () => {
    const required = specs
      .filter((endpoint) => endpoint.group === undefined)
      .map((endpoint) => endpoint.scope)
      .filter(isScopeRequired);
    expect([...new Set(required)].sort()).toEqual([...CORE_GRANT].sort());
  });
});

describe('SCOPES (Base Grant)', () => {
  it('lists exactly the v1 Base Grant scopes', () => {
    expect([...SCOPES].sort()).toEqual(
      [
        'esi-skills.read_skills.v1',
        'esi-skills.read_skillqueue.v1',
        'esi-clones.read_implants.v1',
        'esi-wallet.read_character_wallet.v1',
        'esi-assets.read_assets.v1',
        'esi-mail.read_mail.v1',
        'esi-calendar.read_calendar_events.v1',
        'esi-contracts.read_character_contracts.v1',
        'esi-markets.read_character_orders.v1',
        'esi-characters.read_blueprints.v1',
        'esi-industry.read_character_jobs.v1',
        'esi-clones.read_clones.v1',
        'esi-universe.read_structures.v1',
        'esi-planets.manage_planets.v1',
        'esi-characters.read_contacts.v1',
        'esi-characters.read_loyalty.v1',
        'esi-characters.read_standings.v1',
        'esi-location.read_location.v1',
        'esi-location.read_ship_type.v1',
        'esi-characters.read_notifications.v1',
        'esi-search.search_structures.v1',
        'esi-industry.read_character_mining.v1',
        'esi-fittings.read_fittings.v1',
        'esi-corporations.read_structures.v1',
        'esi-wallet.read_corporation_wallets.v1',
        'esi-corporations.read_divisions.v1',
        'esi-corporations.read_corporation_membership.v1',
        'esi-corporations.track_members.v1',
        'esi-industry.read_corporation_mining.v1',
        'esi-industry.read_corporation_jobs.v1',
        'esi-assets.read_corporation_assets.v1',
        'esi-characters.read_corporation_roles.v1',
        'esi-corporations.read_blueprints.v1',
        'esi-corporations.read_starbases.v1',
        'esi-planets.read_customs_offices.v1',
        'esi-structures.read_corporation.v1',
        'esi-corporations.read_titles.v1',
        'esi-contracts.read_corporation_contracts.v1',
        'esi-markets.read_corporation_orders.v1',
        'esi-markets.structure_markets.v1',
        'esi-characters.read_fatigue.v1',
        'esi-corporations.read_projects.v1',
        'esi-killmails.read_killmails.v1',
        'esi-activities.read_character.v1',
        'esi-structures.read_character.v1',
        'esi.activity.char:read',
      ].sort()
    );
  });

  it('excludes all six write scopes', () => {
    for (const scope of WRITE_SCOPES) expect(SCOPES).not.toContain(scope);
  });

  it('has no duplicates', () => {
    expect(new Set(SCOPES).size).toBe(SCOPES.length);
  });

  it('contains no PUBLIC marker from the registry', () => {
    expect(SCOPES).not.toContain(PUBLIC);
  });
});

describe('scopesForGroup', () => {
  it("lists exactly the corp group's scopes", () => {
    expect([...scopesForGroup('corp')].sort()).toEqual(
      [
        'esi-corporations.read_structures.v1',
        'esi-wallet.read_corporation_wallets.v1',
        'esi-corporations.read_divisions.v1',
        'esi-corporations.read_corporation_membership.v1',
        'esi-corporations.track_members.v1',
        'esi-industry.read_corporation_mining.v1',
        'esi-industry.read_corporation_jobs.v1',
        'esi-assets.read_corporation_assets.v1',
        'esi-characters.read_corporation_roles.v1',
        'esi-corporations.read_blueprints.v1',
        'esi-corporations.read_starbases.v1',
        'esi-planets.read_customs_offices.v1',
        'esi-structures.read_corporation.v1',
        'esi-corporations.read_titles.v1',
        'esi-contracts.read_corporation_contracts.v1',
        'esi-markets.read_corporation_orders.v1',
      ].sort()
    );
  });

  it("lists exactly the structureMarkets group's scopes (issue #538)", () => {
    expect([...scopesForGroup('structureMarkets')].sort()).toEqual(
      ['esi-markets.structure_markets.v1'].sort()
    );
  });

  it("lists exactly the mercenaryDens group's scopes (issue #5153)", () => {
    expect([...scopesForGroup('mercenaryDens')].sort()).toEqual(
      ['esi-activities.read_character.v1', 'esi-structures.read_character.v1'].sort()
    );
    expect(SCOPES).toContain('esi-structures.read_character.v1');
    expect(SCOPES).toContain('esi-activities.read_character.v1');
  });

  it("lists exactly the jumpFatigue group's scopes (issue #3581)", () => {
    expect([...scopesForGroup('jumpFatigue')]).toEqual(['esi-characters.read_fatigue.v1']);
    expect(SCOPES).toContain('esi-characters.read_fatigue.v1');
  });

  it("lists exactly the killmails group's scopes", () => {
    expect([...scopesForGroup('killmails')]).toEqual(['esi-killmails.read_killmails.v1']);
    expect(SCOPES).toContain('esi-killmails.read_killmails.v1');
  });

  it("lists exactly the militaryCampaigns group's scopes (issue #6703)", () => {
    expect([...scopesForGroup('militaryCampaigns')]).toEqual(['esi.activity.char:read']);
    expect(SCOPES).toContain('esi.activity.char:read');
  });

  it("lists exactly the corpProjects group's scopes (issue #4786)", () => {
    expect([...scopesForGroup('corpProjects')]).toEqual(['esi-corporations.read_projects.v1']);
    expect(SCOPES).toContain('esi-corporations.read_projects.v1');
  });

  it('keeps the corp assets scope in the corp group, apart from the character one', () => {
    expect(scopesForGroup('corp')).toContain('esi-assets.read_corporation_assets.v1');
    expect(scopesForGroup('assets')).not.toContain('esi-assets.read_corporation_assets.v1');
    expect(SCOPES).toContain('esi-assets.read_assets.v1');
    expect(scopesForGroup('corp')).not.toContain('esi-assets.read_assets.v1');
  });

  it('keeps opt-in groups out of the Base Grant and default-on groups inside it', () => {
    const base = new Set<string>(SCOPES);
    for (const group of OPT_IN_GROUPS) {
      expect(
        scopesForGroup(group).filter((scope) => base.has(scope)),
        group
      ).toEqual([]);
    }
    for (const group of DEFAULT_ON_GROUPS) {
      for (const scope of scopesForGroup(group)) {
        expect(base.has(scope), `${group}: ${scope}`).toBe(true);
      }
    }
  });

  it('assigns every scope to the Core Grant or to exactly one Permission — never both, never neither', () => {
    const core = new Set<string>(CORE_GRANT);
    const seen = new Map<string, string>();
    for (const group of SCOPE_GROUPS) {
      for (const scope of scopesForGroup(group)) {
        expect(core.has(scope), `${scope} in both Core Grant and ${group}`).toBe(false);
        const owner = seen.get(scope);
        expect(
          owner === undefined || owner === group,
          `${scope} in both ${owner} and ${group}`
        ).toBe(true);
        seen.set(scope, group);
      }
    }
  });

  it('resolves every scope to the same group on every endpoint that declares it', () => {
    const groupByScope = new Map<string, string | undefined>();
    for (const spec of specs) {
      if (!isScopeRequired(spec.scope)) continue;
      const owner = groupByScope.get(spec.scope);
      if (owner === undefined && !groupByScope.has(spec.scope)) {
        groupByScope.set(spec.scope, spec.group);
        continue;
      }
      expect(spec.group, spec.scope).toBe(owner);
    }
  });

  it('has no duplicates and contains no PUBLIC marker', () => {
    for (const group of SCOPE_GROUPS) {
      const scopes = scopesForGroup(group);
      expect(new Set(scopes).size, group).toBe(scopes.length);
      expect(scopes, group).not.toContain(PUBLIC);
    }
  });

  it('covers every scope the group’s endpoints require', () => {
    for (const group of SCOPE_GROUPS) {
      const required = specs
        .filter((endpoint) => endpoint.group === group)
        .map((endpoint) => endpoint.scope)
        .filter(isScopeRequired);
      expect([...new Set(required)].sort(), group).toEqual([...scopesForGroup(group)].sort());
    }
  });

  it('leaves every declared group non-empty — an empty group is a dead declaration', () => {
    for (const group of SCOPE_GROUPS) {
      expect(scopesForGroup(group).length, group).toBeGreaterThan(0);
    }
  });
});

describe('permissionForScope', () => {
  it('names the Permission a grouped scope belongs to (issue #1525)', () => {
    expect(permissionForScope('esi-industry.read_character_jobs.v1')).toBe('industry');
    expect(permissionForScope('esi-wallet.read_character_wallet.v1')).toBe('wallet');
    expect(permissionForScope('esi-characters.read_notifications.v1')).toBe('notifications');
  });

  it('is undefined for a Core Grant scope, which belongs to no Permission', () => {
    for (const scope of CORE_GRANT) expect(permissionForScope(scope)).toBeUndefined();
  });

  it('inverts scopesForGroup for every Permission', () => {
    for (const group of SCOPE_GROUPS) {
      for (const scope of scopesForGroup(group)) expect(permissionForScope(scope)).toBe(group);
    }
  });
});

describe('PERMISSIONS', () => {
  it('has a label key, a caption key and a default-on flag for every group', () => {
    for (const group of SCOPE_GROUPS) {
      const meta = PERMISSIONS[group];
      expect(meta.labelKey, group).toMatch(/^permissions\./);
      expect(meta.captionKey, group).toMatch(/^permissions\./);
      expect(typeof meta.defaultOn, group).toBe('boolean');
    }
  });

  it('marks only the six Write to EVE groups opt-in and every read group default-on (#6102)', () => {
    const optIn = SCOPE_GROUPS.filter((group) => !PERMISSIONS[group].defaultOn);
    expect([...optIn].sort()).toEqual(
      [
        'mailSend',
        'mailOrganize',
        'calendarRespond',
        'fittingsWrite',
        'autopilot',
        'openWindow',
      ].sort()
    );
  });

  it('WRITE_GROUPS is exactly the six write features, all off by default', () => {
    expect([...WRITE_GROUPS].sort()).toEqual(
      [
        'mailSend',
        'mailOrganize',
        'calendarRespond',
        'fittingsWrite',
        'autopilot',
        'openWindow',
      ].sort()
    );
    for (const group of WRITE_GROUPS) expect(PERMISSIONS[group].defaultOn, group).toBe(false);
  });

  it('puts each write scope in its own single-scope group', () => {
    const owners = WRITE_SCOPES.map((scope) => permissionForScope(scope));
    expect(new Set(owners).size).toBe(6);
    expect([...owners].sort()).toEqual([...WRITE_GROUPS].sort());
    for (const group of WRITE_GROUPS) expect(scopesForGroup(group), group).toHaveLength(1);
  });
});

describe('revokedScopes', () => {
  it('returns nothing when the sets are identical', () => {
    expect(revokedScopes([...SCOPES], [...SCOPES])).toEqual([]);
  });

  it('returns nothing when scopes are ADDED (a wider grant is not a revocation)', () => {
    const previous = ['esi-skills.read_skills.v1'];
    const next = [
      'esi-skills.read_skills.v1',
      'esi-mail.read_mail.v1',
      'esi-assets.read_assets.v1',
    ];
    expect(revokedScopes(previous, next)).toEqual([]);
  });

  it('returns only the removals from a mixed add-and-remove diff', () => {
    const previous = ['esi-skills.read_skills.v1', 'esi-mail.read_mail.v1'];
    const next = ['esi-skills.read_skills.v1', 'esi-assets.read_assets.v1'];
    expect(revokedScopes(previous, next)).toEqual(['esi-mail.read_mail.v1']);
  });

  it('is order-independent on both sides', () => {
    const previous = ['b', 'a', 'c'];
    const next = ['c', 'b', 'a'];
    expect(revokedScopes(previous, next)).toEqual([]);
    expect(revokedScopes(previous, ['c', 'a'])).toEqual(['b']);
  });

  it('reports a full revocation when the new grant is empty', () => {
    expect(revokedScopes(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('reports nothing when the previous grant was empty', () => {
    expect(revokedScopes([], ['a'])).toEqual([]);
  });

  it('deduplicates a repeated scope in the previous set', () => {
    expect(revokedScopes(['a', 'a'], [])).toEqual(['a']);
  });

  it('reports a removed scope the app does not model (renamed or hand-granted)', () => {
    expect(revokedScopes(['esi-corporations.read_divisions.v1'], [])).toEqual([
      'esi-corporations.read_divisions.v1',
    ]);
  });
});

describe('isPermissionGranted', () => {
  it('never has a Permission with no scopes to hold', () => {
    for (const group of SCOPE_GROUPS)
      expect(scopesForGroup(group).length, group).toBeGreaterThan(0);
  });

  it('is granted when every scope of the Permission is held', () => {
    expect(isPermissionGranted('mail', [...CORE_GRANT, ...scopesForGroup('mail')])).toBe(true);
  });

  it('is missing when nothing of the Permission is held', () => {
    expect(isPermissionGranted('mail', [...CORE_GRANT])).toBe(false);
  });

  it('is missing when only part of the Permission is held', () => {
    expect(isPermissionGranted('corp', scopesForGroup('corp').slice(1))).toBe(false);
  });

  it('ignores scopes of other Permissions', () => {
    expect(isPermissionGranted('wallet', [...SCOPES])).toBe(true);
    expect(isPermissionGranted('mailSend', [...SCOPES])).toBe(false);
  });
});
