import { describe, it, expect } from 'vitest';
import { SCOPES, SCOPES_STRING, revokedScopes, scopesForGroup } from './scopes';
import {
  ESI_REGISTRY,
  PUBLIC,
  SCOPE_GROUPS,
  isScopeRequired,
  type EsiEndpointSpec,
} from './registry';

const specs: readonly EsiEndpointSpec[] = Object.values(ESI_REGISTRY);

describe('SCOPES', () => {
  // Hand-written, not derived: SCOPES is computed from registry.ts, so a
  // derived expectation would assert nothing. This is the spelling backstop.
  it('lists exactly the v1 read scopes', () => {
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
        'esi-location.read_location.v1',
        'esi-characters.read_notifications.v1',
        'esi-characters.read_corporation_roles.v1',
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

  it('covers every scope an UNGROUPED registry endpoint requires', () => {
    const required = specs
      .filter((endpoint) => endpoint.group === undefined)
      .map((endpoint) => endpoint.scope)
      .filter(isScopeRequired);
    expect([...new Set(required)].sort()).toEqual([...SCOPES].sort());
  });

  it('exposes a space-joined string for the SSO scope parameter', () => {
    expect(SCOPES_STRING).toBe(SCOPES.join(' '));
    expect(SCOPES_STRING.split(' ')).toHaveLength(SCOPES.length);
  });
});

describe('scopesForGroup', () => {
  // Hand-written for the same reason as the SCOPES list above: the spelling
  // backstop for the opt-in group, which no derived expectation can provide.
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
   * Acceptance criterion 1, with teeth. The base/group split is decided per
   * *endpoint*, so one ungrouped endpoint declaring a corp scope would put it
   * back on every user's consent screen with nothing else failing. Overlap is
   * an error to fix at the declaration, never something to subtract here.
   */
  it('shares no scope with the base SCOPES set', () => {
    const base = new Set<string>(SCOPES);
    for (const group of SCOPE_GROUPS) {
      expect(
        scopesForGroup(group).filter((scope) => base.has(scope)),
        group
      ).toEqual([]);
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
