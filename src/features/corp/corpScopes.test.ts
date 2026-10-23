import { describe, it, expect } from 'vitest';
import { CORP_CAPABILITIES, corpCapabilities } from '@/engine/corpRoles';
import { SCOPES, scopesForGroup } from '@/esi/scopes';
import { CORP_SCOPES_FOR_CAPABILITY, corpGrantCoverage, missingCorpScopes } from './corpScopes';

const CONTRACTS = 'esi-contracts.read_corporation_contracts.v1';
const ORDERS = 'esi-markets.read_corporation_orders.v1';

/**
 * `missingCorpScopes` without the contracts scope, which every member is asked for
 * (no role gates it): these tests are about what each *role* needs.
 */
const missingForRoles = (...args: Parameters<typeof missingCorpScopes>) =>
  missingCorpScopes(...args).filter((scope) => scope !== CONTRACTS);

/** Nothing granted, so "missing" is the full required set — the shape most tests want. */
const requiredFor = (roles: readonly string[]) => missingForRoles(corpCapabilities(roles), []);

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
  it('asks only for the contracts scope when no role is held: every member reads contracts', () => {
    expect(missingCorpScopes(corpCapabilities([]), [])).toEqual([CONTRACTS]);
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
    // Not one per capability: a capability may need more than one scope, and a
    // scope may serve more than one capability (corpScopes.ts).
    expect(scopes.length).toBeGreaterThanOrEqual(CORP_CAPABILITIES.length - 2);
  });
});

describe('missingCorpScopes', () => {
  it('reports the scopes a capable character has not granted', () => {
    expect(missingForRoles(corpCapabilities(['Factory_Manager']), [])).toEqual([
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
      missingForRoles(corpCapabilities(['Junior_Accountant']), [
        'esi-wallet.read_corporation_wallets.v1',
      ])
    ).toEqual(['esi-corporations.read_divisions.v1']);
  });

  it('reports nothing once every needed scope is granted', () => {
    expect(
      missingForRoles(corpCapabilities(['Factory_Manager']), [
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
    const factoryManager = missingForRoles(corpCapabilities(['Factory_Manager']), []);
    const director = missingForRoles(corpCapabilities(['Director']), []);
    expect(factoryManager).toEqual(['esi-industry.read_corporation_jobs.v1']);
    expect(factoryManager).not.toContain('esi-wallet.read_corporation_wallets.v1');
    expect(director).toContain('esi-wallet.read_corporation_wallets.v1');
    expect(director.length).toBeGreaterThan(factoryManager.length);
  });

  it('reports the remainder when a Director has granted only some of them', () => {
    const all = requiredFor(['Director']);
    const missing = missingForRoles(corpCapabilities(['Director']), [
      'esi-corporations.read_structures.v1',
    ]);
    expect(missing).not.toContain('esi-corporations.read_structures.v1');
    expect(missing).toHaveLength(all.length - 1);
  });

  it('ignores unrelated granted scopes', () => {
    expect(missingForRoles(corpCapabilities([]), ['esi-skills.read_skills.v1'])).toEqual([]);
  });

  /**
   * #330's scope decision (GLOSSARY.md round 44): `canReadAssets` claims
   * `read_divisions` too, not just `canReadWallet`, so this map does not lie
   * about what a division-first assets surface actually needs. It costs no
   * one a re-grant — every Director (the only role `canReadAssets` answers
   * to) already holds `canReadWallet` as well (`corpCapabilities` sets every
   * capability for a Director), and already needed the scope through that.
   * The required set names it once, not twice.
   */
  it('claims read_divisions for canReadAssets as well as canReadWallet, and a Director needing it twice over still asks for it once', () => {
    expect(CORP_SCOPES_FOR_CAPABILITY.canReadAssets).toContain(
      'esi-corporations.read_divisions.v1'
    );
    const director = corpCapabilities(['Director']);
    expect(director.canReadWallet).toBe(true);
    expect(director.canReadAssets).toBe(true);
    expect(
      requiredFor(['Director']).filter((scope) => scope === 'esi-corporations.read_divisions.v1')
    ).toHaveLength(1);
  });
});

const MINING = 'esi-industry.read_corporation_mining.v1';
const WALLET_SCOPES = [
  'esi-wallet.read_corporation_wallets.v1',
  'esi-corporations.read_divisions.v1',
];

describe('corpGrantCoverage', () => {
  it('claims the corp mining scope for the mining ledger', () => {
    expect(CORP_SCOPES_FOR_CAPABILITY.canReadMiningLedger).toEqual([MINING]);
  });

  /**
   * The re-grant path issue #4058 settles. An Accountant who granted the corp
   * group before #327 added the mining scope holds every scope the wallet
   * needs and none the ledger does. Claiming the scope for the ledger must
   * not take their wallet away: the grant is still asked for, but nothing
   * already readable hides while it is.
   */
  it('asks for an additive capability’s scope without blocking the rest', () => {
    const coverage = corpGrantCoverage(corpCapabilities(['Accountant']), WALLET_SCOPES);
    expect(coverage.missingScopes).toEqual([MINING, CONTRACTS, ORDERS]);
    expect(coverage.blocking).toBe(false);
    expect(coverage.capabilities.canReadWallet).toBe(true);
    // Unreadable until granted, so nothing reads the ledger into a 403.
    expect(coverage.capabilities.canReadMiningLedger).toBe(false);
  });

  it('turns the additive capability on once its scope is granted', () => {
    const coverage = corpGrantCoverage(corpCapabilities(['Accountant']), [
      ...WALLET_SCOPES,
      MINING,
      CONTRACTS,
      ORDERS,
    ]);
    expect(coverage).toEqual({
      missingScopes: [],
      blocking: false,
      capabilities: corpCapabilities(['Accountant']),
    });
  });

  /** Issue #4610: a Director who granted the corp group before starbases keeps every corp surface. */
  it('keeps a Director who predates the starbase scope out of roles-without-grant', () => {
    const STARBASES = 'esi-corporations.read_starbases.v1';
    const coverage = corpGrantCoverage(
      corpCapabilities(['Director']),
      scopesForGroup('corp').filter((scope) => scope !== STARBASES)
    );
    expect(coverage.missingScopes).toEqual([STARBASES]);
    expect(coverage.blocking).toBe(false);
    expect(coverage.capabilities.canReadStarbases).toBe(false);
    expect(coverage.capabilities.canReadWallet).toBe(true);
    expect(coverage.capabilities.canReadAssets).toBe(true);
  });

  it('blocks a Trader-only Character whose only capability is ungranted', () => {
    const coverage = corpGrantCoverage(corpCapabilities(['Trader']), []);
    expect(coverage.blocking).toBe(true);
    expect(coverage.missingScopes).toContain(ORDERS);
  });

  it('keeps a Trader ready once the orders scope is granted', () => {
    expect(corpGrantCoverage(corpCapabilities(['Trader']), [ORDERS]).blocking).toBe(false);
  });

  it('still blocks when a non-additive capability lacks a scope', () => {
    const coverage = corpGrantCoverage(corpCapabilities(['Accountant']), [MINING]);
    expect(coverage.blocking).toBe(true);
    expect(coverage.missingScopes).toEqual([...WALLET_SCOPES, CONTRACTS, ORDERS]);
  });

  // Added after members already reached `ready` (#4607): lacking it must not hide the corp UI.
  it('keeps a Character ready, with contracts off, when only the contracts scope is missing', () => {
    const granted = scopesForGroup('corp').filter((scope) => scope !== CONTRACTS);
    const coverage = corpGrantCoverage(corpCapabilities(['Director']), granted);
    expect(coverage.missingScopes).toEqual([CONTRACTS]);
    expect(coverage.blocking).toBe(false);
    expect(coverage.capabilities.canReadContracts).toBe(false);
    expect(coverage.capabilities.canReadWallet).toBe(true);
  });

  /**
   * The same scope also serves the extraction schedule, which is not
   * additive: a Station_Manager missing it was already blocked before the
   * ledger existed, and still is.
   */
  it('blocks when a shared scope is also needed by a non-additive capability', () => {
    const coverage = corpGrantCoverage(corpCapabilities(['Director']), [
      ...scopesForGroup('corp').filter((scope) => scope !== MINING),
    ]);
    expect(coverage.missingScopes).toEqual([MINING]);
    expect(coverage.blocking).toBe(true);
  });

  it('keeps a Director’s older grant ready when only the customs scope is missing (#4611)', () => {
    const CUSTOMS = 'esi-planets.read_customs_offices.v1';
    expect(CORP_SCOPES_FOR_CAPABILITY.canReadCustomsOffices).toEqual([CUSTOMS]);
    const coverage = corpGrantCoverage(
      corpCapabilities(['Director']),
      scopesForGroup('corp').filter((scope) => scope !== CUSTOMS)
    );
    expect(coverage.blocking).toBe(false);
    expect(coverage.missingScopes).toEqual([CUSTOMS]);
    expect(coverage.capabilities.canReadCustomsOffices).toBe(false);
    expect(coverage.capabilities.canReadWallet).toBe(true);
  });

  it('keeps a Director’s older grant ready when only the titles scope is missing (#4613)', () => {
    const TITLES = 'esi-corporations.read_titles.v1';
    expect(CORP_SCOPES_FOR_CAPABILITY.canReadRoleAudit).toContain(TITLES);
    const coverage = corpGrantCoverage(
      corpCapabilities(['Director']),
      scopesForGroup('corp').filter((scope) => scope !== TITLES)
    );
    expect(coverage.blocking).toBe(false);
    expect(coverage.missingScopes).toEqual([TITLES]);
    expect(coverage.capabilities.canReadRoleAudit).toBe(false);
    expect(coverage.capabilities.canReadMembers).toBe(true);
  });

  it('reports the same missing set as missingCorpScopes', () => {
    for (const roles of [['Director'], ['Accountant'], ['Station_Manager'], []]) {
      const capabilities = corpCapabilities(roles);
      expect(corpGrantCoverage(capabilities, []).missingScopes).toEqual(
        missingCorpScopes(capabilities, [])
      );
    }
  });
});
