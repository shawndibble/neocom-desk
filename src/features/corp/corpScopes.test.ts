import { describe, it, expect } from 'vitest';
import { CORP_CAPABILITIES, corpCapabilities } from '@/engine/corpRoles';
import { SCOPES, scopesForGroup } from '@/esi/scopes';
import { CORP_SCOPES_FOR_CAPABILITY, missingCorpScopes } from './corpScopes';

/** Nothing granted, so "missing" is the full required set — the shape most tests want. */
const requiredFor = (roles: readonly string[]) => missingCorpScopes(corpCapabilities(roles), []);

describe('CORP_SCOPES_FOR_CAPABILITY', () => {
  it('names a scope for every capability, so none can be silently unrequestable', () => {
    for (const capability of CORP_CAPABILITIES) {
      expect(CORP_SCOPES_FOR_CAPABILITY[capability].length, capability).toBeGreaterThan(0);
    }
  });

  it('declares well-formed ESI scope strings', () => {
    for (const capability of CORP_CAPABILITIES) {
      for (const scope of CORP_SCOPES_FOR_CAPABILITY[capability]) {
        expect(scope, capability).toMatch(/^esi-[a-z_]+\.[a-z_]+\.v\d+$/);
      }
    }
  });

  /**
   * The map selects from the registry rather than restating it (#295). A scope
   * outside the `corp` group is unreachable: the Grant button asks for the
   * group, so a capability needing something the group does not carry would sit
   * at `roles-without-grant` forever, one click away from nothing.
   */
  it('is satisfied in full by granting the corp group, for every set of roles', () => {
    // The Grant button asks for the whole group, so every capability's needs
    // must be inside it — the round trip has to end at `ready`.
    for (const roles of [['Director'], ['Accountant'], ['Station_Manager'], ['Factory_Manager']]) {
      expect(
        missingCorpScopes(corpCapabilities(roles), [...scopesForGroup('corp')]),
        roles[0]
      ).toEqual([]);
    }
  });

  it('names only scopes the corp group actually requests', () => {
    const group = new Set<string>(scopesForGroup('corp'));
    for (const capability of CORP_CAPABILITIES) {
      for (const scope of CORP_SCOPES_FOR_CAPABILITY[capability]) {
        expect(group.has(scope), `${capability}: ${scope}`).toBe(true);
      }
    }
  });

  it('names no scope already in the base grant — those need no gate', () => {
    const base = new Set<string>(SCOPES);
    for (const capability of CORP_CAPABILITIES) {
      for (const scope of CORP_SCOPES_FOR_CAPABILITY[capability]) {
        expect(base.has(scope), `${capability}: ${scope}`).toBe(false);
      }
    }
  });
});

describe('the required scope set', () => {
  it('asks for nothing when no capability is held', () => {
    expect(requiredFor([])).toEqual([]);
  });

  /**
   * Two scopes for one role: `Station_Manager` opens both the structure list
   * and the moon-extraction schedule, and each is behind a scope of its own.
   */
  it('asks only for the scopes the held capabilities need', () => {
    expect(requiredFor(['Station_Manager'])).toEqual([
      'esi-corporations.read_structures.v1',
      'esi-industry.read_corporation_mining.v1',
    ]);
  });

  it('unions without duplicating when several capabilities are held', () => {
    const scopes = requiredFor(['Director']);
    expect(new Set(scopes).size).toBe(scopes.length);
    // Not one per capability: a capability may need more than one scope, and
    // two do (corpScopes.ts).
    expect(scopes.length).toBeGreaterThanOrEqual(CORP_CAPABILITIES.length);
  });
});

describe('missingCorpScopes', () => {
  it('reports the scopes a capable character has not granted', () => {
    expect(missingCorpScopes(corpCapabilities(['Factory_Manager']), [])).toEqual([
      'esi-industry.read_corporation_jobs.v1',
    ]);
  });

  /**
   * The half-blind case: the wallet scope alone renders divisions as
   * "Division 3" rather than the name the corp gave them, so a Character
   * holding only it is not `ready`.
   */
  it('still reports the divisions scope when only the wallet scope is granted', () => {
    expect(
      missingCorpScopes(corpCapabilities(['Accountant']), [
        'esi-wallet.read_corporation_wallets.v1',
      ])
    ).toEqual(['esi-corporations.read_divisions.v1']);
  });

  it('reports nothing once every needed scope is granted', () => {
    expect(
      missingCorpScopes(corpCapabilities(['Factory_Manager']), [
        'esi-industry.read_corporation_jobs.v1',
      ])
    ).toEqual([]);
  });

  /**
   * A Factory_Manager who is not an Accountant must not be held back waiting on
   * a corp wallet scope they could never use anything with. The contrast with
   * the Director is the point: same empty grant, different ask.
   */
  it('ignores scopes for capabilities the character does not hold', () => {
    const factoryManager = missingCorpScopes(corpCapabilities(['Factory_Manager']), []);
    const director = missingCorpScopes(corpCapabilities(['Director']), []);
    expect(factoryManager).toEqual(['esi-industry.read_corporation_jobs.v1']);
    expect(factoryManager).not.toContain('esi-wallet.read_corporation_wallets.v1');
    expect(director).toContain('esi-wallet.read_corporation_wallets.v1');
    expect(director.length).toBeGreaterThan(factoryManager.length);
  });

  it('reports the remainder when a Director has granted only some of them', () => {
    const all = requiredFor(['Director']);
    const missing = missingCorpScopes(corpCapabilities(['Director']), [
      'esi-corporations.read_structures.v1',
    ]);
    expect(missing).not.toContain('esi-corporations.read_structures.v1');
    expect(missing).toHaveLength(all.length - 1);
  });

  it('ignores unrelated granted scopes', () => {
    expect(missingCorpScopes(corpCapabilities([]), ['esi-skills.read_skills.v1'])).toEqual([]);
  });
});
