import { describe, expect, it } from 'vitest';
import { corpCapabilities, NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import { miningLedgerAccess } from './miningLedgerAccess';

const ready = (roles: string[], ledger: boolean) => ({
  state: 'ready' as const,
  roles,
  capabilities: { ...corpCapabilities(roles), canReadMiningLedger: ledger },
});

describe('miningLedgerAccess', () => {
  it('waits while corp access resolves', () => {
    expect(
      miningLedgerAccess({ state: 'unknown', roles: [], capabilities: NO_CORP_CAPABILITIES })
    ).toEqual({
      state: 'unknown',
    });
  });

  it('is ready for an Accountant holding the scope', () => {
    expect(miningLedgerAccess(ready(['Accountant'], true))).toEqual({ state: 'ready' });
  });

  it('asks an Accountant without the scope for exactly that scope', () => {
    expect(miningLedgerAccess(ready(['Accountant'], false))).toEqual({
      state: 'needs-scope',
      scopes: ['esi-industry.read_corporation_mining.v1'],
    });
  });

  it('never asks a Character whose roles cannot read the ledger', () => {
    expect(miningLedgerAccess(ready(['Junior_Accountant'], false))).toEqual({
      state: 'unavailable',
    });
    expect(
      miningLedgerAccess({ state: 'none', roles: [], capabilities: NO_CORP_CAPABILITIES })
    ).toEqual({ state: 'unavailable' });
  });
});
