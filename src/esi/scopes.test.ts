import { describe, it, expect } from 'vitest';
import { SCOPES, SCOPES_STRING, revokedScopes } from './scopes';
import { ESI_REGISTRY, PUBLIC, isScopeRequired } from './registry';

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
      ].sort()
    );
  });

  it('has no duplicates', () => {
    expect(new Set(SCOPES).size).toBe(SCOPES.length);
  });

  it('contains no PUBLIC marker from the registry', () => {
    expect(SCOPES).not.toContain(PUBLIC);
  });

  it('covers every scope some registry endpoint requires', () => {
    const required = Object.values(ESI_REGISTRY)
      .map((endpoint) => endpoint.scope)
      .filter(isScopeRequired);
    expect([...new Set(required)].sort()).toEqual([...SCOPES].sort());
  });

  it('exposes a space-joined string for the SSO scope parameter', () => {
    expect(SCOPES_STRING).toBe(SCOPES.join(' '));
    expect(SCOPES_STRING.split(' ')).toHaveLength(SCOPES.length);
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
