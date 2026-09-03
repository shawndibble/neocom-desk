import { describe, it, expect } from 'vitest';
import { CORP_CAPABILITIES, corpCapabilities } from '@/engine/corpRoles';
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
});

describe('the required scope set', () => {
  it('asks for nothing when no capability is held', () => {
    expect(requiredFor([])).toEqual([]);
  });

  it('asks only for the scopes the held capabilities need', () => {
    expect(requiredFor(['Station_Manager'])).toEqual(['esi-corporations.read_structures.v1']);
  });

  it('unions without duplicating when several capabilities are held', () => {
    const scopes = requiredFor(['Director']);
    expect(new Set(scopes).size).toBe(scopes.length);
    expect(scopes).toHaveLength(CORP_CAPABILITIES.length);
  });
});

describe('missingCorpScopes', () => {
  it('reports the scopes a capable character has not granted', () => {
    expect(missingCorpScopes(corpCapabilities(['Factory_Manager']), [])).toEqual([
      'esi-industry.read_corporation_jobs.v1',
    ]);
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
    expect(director).toHaveLength(CORP_CAPABILITIES.length);
  });

  it('reports the remainder when a Director has granted only some of them', () => {
    const missing = missingCorpScopes(corpCapabilities(['Director']), [
      'esi-corporations.read_structures.v1',
    ]);
    expect(missing).not.toContain('esi-corporations.read_structures.v1');
    expect(missing).toHaveLength(CORP_CAPABILITIES.length - 1);
  });

  it('ignores unrelated granted scopes', () => {
    expect(missingCorpScopes(corpCapabilities([]), ['esi-skills.read_skills.v1'])).toEqual([]);
  });
});
