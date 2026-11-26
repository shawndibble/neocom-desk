import { describe, it, expect } from 'vitest';
import {
  CORP_CAPABILITIES,
  NO_CORP_CAPABILITIES,
  corpCapabilities,
  hasAnyCorpCapability,
  canViewCorpTaxBook,
  type CorpCapability,
} from './corpRoles';

function held(roles: readonly string[]): CorpCapability[] {
  const capabilities = corpCapabilities(roles);
  return CORP_CAPABILITIES.filter(
    (capability) => capability !== 'canReadContracts' && capabilities[capability]
  );
}

describe('corpCapabilities', () => {
  it('grants nothing to a character with no roles', () => {
    expect(held([])).toEqual([]);
    expect(corpCapabilities([])).toEqual({ ...NO_CORP_CAPABILITIES, canReadContracts: true });
    expect(hasAnyCorpCapability(corpCapabilities([]))).toBe(false);
  });

  it('grants contracts to every member, without opening any corp surface', () => {
    for (const roles of [[], ['Accountant'], ['Personnel_Manager']]) {
      expect(corpCapabilities(roles).canReadContracts, roles.join()).toBe(true);
    }
    expect(hasAnyCorpCapability({ ...NO_CORP_CAPABILITIES, canReadContracts: true })).toBe(false);
  });

  it('grants wallet and mining-ledger access to an Accountant', () => {
    expect(held(['Accountant'])).toEqual([
      'canReadWallet',
      'canReadMiningLedger',
      'canReadOrders',
      'canManageSrp',
      'canViewTaxBook',
    ]);
  });

  it('grants market orders to a Trader alone, and not to a Junior_Accountant', () => {
    expect(held(['Trader'])).toEqual(['canReadOrders']);
    expect(corpCapabilities(['Junior_Accountant']).canReadOrders).toBe(false);
  });

  it('grants wallet access to a Junior_Accountant', () => {
    expect(held(['Junior_Accountant'])).toEqual(['canReadWallet', 'canViewTaxBook']);
  });

  it('grants mining-ledger access to an Accountant or a Director only', () => {
    expect(corpCapabilities(['Accountant']).canReadMiningLedger).toBe(true);
    expect(corpCapabilities(['Director']).canReadMiningLedger).toBe(true);
    expect(corpCapabilities(['Junior_Accountant']).canReadMiningLedger).toBe(false);
    expect(corpCapabilities(['Station_Manager']).canReadMiningLedger).toBe(false);
  });

  it('grants structure and moon-extraction access to a Station_Manager', () => {
    expect(held(['Station_Manager'])).toEqual([
      'canReadStructures',
      'canReadMoonExtractions',
      'canReadSkyhooks',
    ]);
  });

  it('grants member access only to a Director', () => {
    expect(corpCapabilities(['Personnel_Manager']).canReadMembers).toBe(false);
  });

  it('grants industry access to a Factory_Manager', () => {
    expect(held(['Factory_Manager'])).toEqual(['canReadIndustry']);
  });

  it('grants asset access only to a Director', () => {
    expect(corpCapabilities(['Hangar_Take_1']).canReadAssets).toBe(false);
    expect(corpCapabilities(['Factory_Manager']).canReadAssets).toBe(false);
    expect(corpCapabilities(['Director']).canReadAssets).toBe(true);
  });

  it('reads corp divisions as a Director only, never as an Accountant', () => {
    expect(corpCapabilities(['Accountant']).canReadDivisions).toBe(false);
    expect(corpCapabilities(['Junior_Accountant']).canReadDivisions).toBe(false);
    expect(corpCapabilities(['Director']).canReadDivisions).toBe(true);
  });

  it('grants corp blueprint access only to a Director', () => {
    expect(corpCapabilities(['Factory_Manager']).canReadBlueprints).toBe(false);
    expect(corpCapabilities(['Director']).canReadBlueprints).toBe(true);
    expect(corpCapabilities(['Factory_Manager']).canReadCustomsOffices).toBe(false);
    expect(corpCapabilities(['Director']).canReadCustomsOffices).toBe(true);
    expect(corpCapabilities(['Factory_Manager']).canReadRoleAudit).toBe(false);
    expect(corpCapabilities(['Director']).canReadRoleAudit).toBe(true);
  });

  it('opens SRP management to an Accountant or a Director, not a Junior_Accountant (#4848)', () => {
    expect(corpCapabilities(['Accountant']).canManageSrp).toBe(true);
    expect(corpCapabilities(['Director']).canManageSrp).toBe(true);
    expect(corpCapabilities(['Junior_Accountant']).canManageSrp).toBe(false);
    expect(corpCapabilities(['Station_Manager']).canManageSrp).toBe(false);
  });

  it('opens the Corp Tax Book (and its moon pops) to a Director, Accountant or Junior_Accountant (#6116)', () => {
    expect(corpCapabilities(['Director']).canViewTaxBook).toBe(true);
    expect(corpCapabilities(['Accountant']).canViewTaxBook).toBe(true);
    expect(corpCapabilities(['Junior_Accountant']).canViewTaxBook).toBe(true);
    expect(corpCapabilities(['Station_Manager']).canViewTaxBook).toBe(false);
    expect(corpCapabilities([]).canViewTaxBook).toBe(false);
  });

  it('opens SRP settings to a Director alone, never an Accountant', () => {
    expect(corpCapabilities(['Director']).canConfigureSrp).toBe(true);
    expect(corpCapabilities(['Accountant']).canConfigureSrp).toBe(false);
    expect(corpCapabilities(['Junior_Accountant']).canConfigureSrp).toBe(false);
  });

  it('opens Vetting reviews to a Personnel_Manager or a Director, and no other role', () => {
    expect(corpCapabilities(['Personnel_Manager']).canVet).toBe(true);
    expect(corpCapabilities(['Director']).canVet).toBe(true);
    expect(corpCapabilities(['Accountant']).canVet).toBe(false);
    expect(corpCapabilities([]).canVet).toBe(false);
  });

  it('opens Vetting settings to a Director alone, never a Personnel_Manager', () => {
    expect(corpCapabilities(['Director']).canConfigureVetting).toBe(true);
    expect(corpCapabilities(['Personnel_Manager']).canConfigureVetting).toBe(false);
  });

  it('opens the starbase reads to a Director alone', () => {
    expect(corpCapabilities(['Station_Manager']).canReadStarbases).toBe(false);
    expect(corpCapabilities(['Director']).canReadStarbases).toBe(true);
  });

  it('opens the skyhook and sov hub reads to a Station_Manager or a Director (#4775)', () => {
    expect(corpCapabilities(['Accountant']).canReadSkyhooks).toBe(false);
    expect(corpCapabilities(['Station_Manager']).canReadSkyhooks).toBe(true);
    expect(corpCapabilities(['Director']).canReadSkyhooks).toBe(true);
  });

  it('grants every capability to a Director, who is not listed under any other role', () => {
    expect(held(['Director'])).toEqual(
      CORP_CAPABILITIES.filter((capability) => capability !== 'canReadContracts')
    );
    expect(corpCapabilities(['Director']).canReadContracts).toBe(true);
    expect(hasAnyCorpCapability(corpCapabilities(['Director']))).toBe(true);
  });

  it('unions the capabilities of several roles held at once', () => {
    expect(held(['Accountant', 'Factory_Manager'])).toEqual([
      'canReadWallet',
      'canReadMiningLedger',
      'canReadIndustry',
      'canReadOrders',
      'canManageSrp',
      'canViewTaxBook',
    ]);
  });

  it('ignores roles no capability is modelled on, rather than throwing', () => {
    expect(held(['Diplomat', 'Hangar_Take_3', 'Brand_Manager'])).toEqual([]);
  });

  it('ignores a role string this app has never heard of (CCP adds roles without notice)', () => {
    expect(held(['Chief_Vibes_Officer'])).toEqual([]);
    expect(held(['Chief_Vibes_Officer', 'Station_Manager'])).toEqual([
      'canReadStructures',
      'canReadMoonExtractions',
      'canReadSkyhooks',
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

describe('canViewCorpTaxBook', () => {
  it('opens the book to Director, Accountant and Junior_Accountant (D8)', () => {
    expect(canViewCorpTaxBook(['Director'])).toBe(true);
    expect(canViewCorpTaxBook(['Accountant'])).toBe(true);
    expect(canViewCorpTaxBook(['Junior_Accountant'])).toBe(true);
  });

  it('stays closed to every other role, though Junior_Accountant cannot read the ledger', () => {
    expect(canViewCorpTaxBook(['Station_Manager', 'Factory_Manager'])).toBe(false);
    expect(canViewCorpTaxBook([])).toBe(false);
    expect(corpCapabilities(['Junior_Accountant']).canReadMiningLedger).toBe(false);
  });
});
