import { describe, it, expect } from 'vitest';
import {
  CORP_CAPABILITIES,
  NO_CORP_CAPABILITIES,
  corpCapabilities,
  hasAnyCorpCapability,
  type CorpCapability,
} from './corpRoles';

/** Every capability that is true, sorted — terser than asserting four booleans. */
function held(roles: readonly string[]): CorpCapability[] {
  const capabilities = corpCapabilities(roles);
  return CORP_CAPABILITIES.filter((capability) => capabilities[capability]);
}

describe('corpCapabilities', () => {
  it('grants nothing to a character with no roles', () => {
    expect(corpCapabilities([])).toEqual(NO_CORP_CAPABILITIES);
    expect(hasAnyCorpCapability(corpCapabilities([]))).toBe(false);
  });

  // GET /corporations/{id}/wallets (+ journal, transactions) declares
  // x-required-roles ["Accountant", "Junior_Accountant"] — either one alone.
  it('grants wallet access to an Accountant', () => {
    expect(held(['Accountant'])).toEqual(['canReadWallet']);
  });

  it('grants wallet access to a Junior_Accountant', () => {
    expect(held(['Junior_Accountant'])).toEqual(['canReadWallet']);
  });

  /**
   * GET /corporations/{id}/structures declares ["Station_Manager"] — and so
   * does GET /corporation/{id}/mining/extractions, verified against the same
   * `x-required-roles` source the table cites. One role, two capabilities:
   * they stay separate because they are separate *reads* behind separate
   * scopes, and the moon panel needs something of its own to gate on.
   *
   * Note for anyone re-reading issue #296: its comment names the moon role
   * `Structure_manager`. That spelling appears nowhere in ESI's spec.
   */
  it('grants structure and moon-extraction access to a Station_Manager', () => {
    expect(held(['Station_Manager'])).toEqual(['canReadStructures', 'canReadMoonExtractions']);
  });

  // GET /corporations/{id}/membertracking declares ["Director"].
  it('grants member access only to a Director', () => {
    expect(corpCapabilities(['Personnel_Manager']).canReadMembers).toBe(false);
  });

  // GET /corporations/{id}/industry/jobs declares ["Factory_Manager"].
  it('grants industry access to a Factory_Manager', () => {
    expect(held(['Factory_Manager'])).toEqual(['canReadIndustry']);
  });

  /**
   * GET /corporations/{id}/assets declares ["Director"] and nothing else,
   * verified against `x-required-roles` rather than taken from issue #327's
   * prose. So it joins `canReadMembers` as a capability with no ordinary role
   * of its own — the Director clause below is the whole of its gate, and a
   * Hangar_Take/Hangar_Query holder (who can open a corp hangar in the client)
   * gets nothing from ESI.
   */
  it('grants asset access only to a Director', () => {
    expect(corpCapabilities(['Hangar_Take_1']).canReadAssets).toBe(false);
    expect(corpCapabilities(['Factory_Manager']).canReadAssets).toBe(false);
    expect(corpCapabilities(['Director']).canReadAssets).toBe(true);
  });

  /**
   * The case a naive `roles.includes('Accountant')` gets wrong for the most
   * important user. In EVE a Director implicitly holds every other role, and
   * ESI does *not* expand that in the response — a Director's `roles` array is
   * frequently just `["Director"]`.
   */
  it('grants every capability to a Director, who is not listed under any other role', () => {
    expect(held(['Director'])).toEqual([...CORP_CAPABILITIES]);
    expect(hasAnyCorpCapability(corpCapabilities(['Director']))).toBe(true);
  });

  it('unions the capabilities of several roles held at once', () => {
    expect(held(['Accountant', 'Factory_Manager'])).toEqual(['canReadWallet', 'canReadIndustry']);
  });

  it('ignores roles no capability is modelled on, rather than throwing', () => {
    expect(held(['Diplomat', 'Hangar_Take_3', 'Brand_Manager'])).toEqual([]);
  });

  it('ignores a role string this app has never heard of (CCP adds roles without notice)', () => {
    expect(held(['Chief_Vibes_Officer'])).toEqual([]);
    expect(held(['Chief_Vibes_Officer', 'Station_Manager'])).toEqual([
      'canReadStructures',
      'canReadMoonExtractions',
    ]);
  });

  it('is case-sensitive: ESI role strings are exact, and a near-miss must not grant access', () => {
    expect(held(['director'])).toEqual([]);
    expect(held(['ACCOUNTANT'])).toEqual([]);
  });

  it('does not mutate or retain the roles it was handed', () => {
    const roles = ['Accountant'];
    corpCapabilities(roles);
    expect(roles).toEqual(['Accountant']);
  });
});

describe('hasAnyCorpCapability', () => {
  it('is false for the empty capability set', () => {
    expect(hasAnyCorpCapability(NO_CORP_CAPABILITIES)).toBe(false);
  });

  it('is true as soon as one capability is held', () => {
    expect(hasAnyCorpCapability(corpCapabilities(['Junior_Accountant']))).toBe(true);
  });
});

describe('CORP_CAPABILITIES', () => {
  it('lists exactly the keys of a capability set, so consumers can iterate it exhaustively', () => {
    expect([...CORP_CAPABILITIES].sort()).toEqual(Object.keys(NO_CORP_CAPABILITIES).sort());
  });
});
