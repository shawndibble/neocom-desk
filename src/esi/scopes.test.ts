import { describe, it, expect } from 'vitest';
import {
  CORE_GRANT,
  SCOPES,
  SCOPES_STRING,
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
  isScopeRequired,
  type EsiEndpointSpec,
} from './registry';

const specs: readonly EsiEndpointSpec[] = Object.values(ESI_REGISTRY);

const DEFAULT_ON_GROUPS = SCOPE_GROUPS.filter((group) => PERMISSIONS[group].defaultOn);
const OPT_IN_GROUPS = SCOPE_GROUPS.filter((group) => !PERMISSIONS[group].defaultOn);

describe('CORE_GRANT', () => {
  // Hand-written, not derived: the spelling backstop, same reasoning as
  // SCOPES below.
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
  // Hand-written, not derived: SCOPES is computed from registry.ts, so a
  // derived expectation would assert nothing. This is the spelling backstop.
  // Most scopes here are reads — `organize_mail`, `send_mail` and
  // `respond_calendar_events` are the deliberate write exceptions.
  it('lists exactly the v1 Base Grant scopes', () => {
    expect([...SCOPES].sort()).toEqual(
      [
        'esi-skills.read_skills.v1',
        'esi-skills.read_skillqueue.v1',
        'esi-clones.read_implants.v1',
        'esi-wallet.read_character_wallet.v1',
        'esi-assets.read_assets.v1',
        'esi-mail.read_mail.v1',
        'esi-mail.organize_mail.v1',
        'esi-mail.send_mail.v1',
        'esi-calendar.read_calendar_events.v1',
        'esi-calendar.respond_calendar_events.v1',
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
        'esi-characters.read_notifications.v1',
        'esi-search.search_structures.v1',
        'esi-industry.read_character_mining.v1',
      ].sort()
    );
  });

  it('has no duplicates', () => {
    expect(new Set(SCOPES).size).toBe(SCOPES.length);
  });

  it('contains no PUBLIC marker from the registry', () => {
    expect(SCOPES).not.toContain(PUBLIC);
  });

  it('exposes a space-joined string for the SSO scope parameter', () => {
    expect(SCOPES_STRING).toBe(SCOPES.join(' '));
    expect(SCOPES_STRING.split(' ')).toHaveLength(SCOPES.length);
  });
});

describe('scopesForGroup', () => {
  // Hand-written for the same reason as the SCOPES list above: the spelling
  // backstop for the opt-in groups, which no derived expectation can provide.
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
      ].sort()
    );
  });

  it("lists exactly the structureMarkets group's scopes (issue #538)", () => {
    expect([...scopesForGroup('structureMarkets')].sort()).toEqual(
      ['esi-markets.structure_markets.v1'].sort()
    );
  });

  /**
   * Issue #327's first acceptance criterion, stated as its own case rather than
   * left implicit in the hand-written `SCOPES` list above: registering the corp
   * assets endpoint must widen the *group* and leave the base grant alone. The
   * character assets scope is the one it would be easiest to confuse it with,
   * and they must end up on opposite sides of the split.
   */
  it('keeps the corp assets scope out of the base grant, beside the character one', () => {
    expect(scopesForGroup('corp')).toContain('esi-assets.read_corporation_assets.v1');
    expect(SCOPES).not.toContain('esi-assets.read_corporation_assets.v1');
    expect(SCOPES).toContain('esi-assets.read_assets.v1');
    expect(scopesForGroup('corp')).not.toContain('esi-assets.read_assets.v1');
  });

  /**
   * Acceptance criterion: opt-in Permissions stay out of the Base Grant, and
   * every default-on Permission is actually part of it.
   */
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

  /**
   * Acceptance criterion 1, with teeth. The Core-Grant/Permission split is
   * decided per *endpoint*, so one endpoint declaring a scope inconsistently
   * would put it in two places at once with nothing else failing. Overlap is
   * an error to fix at the declaration, never something to subtract here.
   */
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

  /**
   * A scope repeated across endpoints (e.g. `read_mail` on four routes) must
   * resolve to the same group everywhere it's declared — enforced at the
   * registry, not subtracted here.
   */
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

  // Hand-written, not derived from DEFAULT_ON_GROUPS/OPT_IN_GROUPS above: those
  // are filtered by `defaultOn` itself, so a derived expectation here would
  // pass no matter which way a group's flag flipped.
  it('marks corp and structureMarkets opt-in and every other group default-on', () => {
    const optIn = SCOPE_GROUPS.filter((group) => !PERMISSIONS[group].defaultOn);
    expect([...optIn].sort()).toEqual(['corp', 'structureMarkets'].sort());
  });
});

describe('revokedScopes', () => {
  it('returns nothing when the sets are identical', () => {
    expect(revokedScopes([...SCOPES], [...SCOPES])).toEqual([]);
  });

  it('returns nothing when scopes are ADDED (a wider grant is not a revocation)', () => {
    // The case that would silently nuke every cache on an app update.
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
    // Not filtered through the registry's Scope union: a scope we do not model
    // must still count as revoked, or the purge misses it.
    expect(revokedScopes(['esi-corporations.read_divisions.v1'], [])).toEqual([
      'esi-corporations.read_divisions.v1',
    ]);
  });
});

describe('isPermissionGranted', () => {
  // `.every` over an empty list is vacuously true, so a group that derived no
  // scopes would read as granted for every Character, forever.
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

  // A partial grant (a scope added to the group after the Character granted
  // it) still needs the Grant button to move, so it reads as missing.
  it('is missing when only part of the Permission is held', () => {
    expect(isPermissionGranted('corp', scopesForGroup('corp').slice(1))).toBe(false);
  });

  it('ignores scopes of other Permissions', () => {
    expect(isPermissionGranted('wallet', [...SCOPES])).toBe(true);
    expect(isPermissionGranted('corp', [...SCOPES])).toBe(false);
  });
});
