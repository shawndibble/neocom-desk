import { describe, it, expect } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import {
  EMPTY_CONTRACTS_FILTER,
  filterContracts,
  contractStatusOptions,
  contractTypeOptions,
  type ContractsFilter,
} from './contractsFilter';

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    contract_id: 1,
    issuer_id: 500001,
    issuer_corporation_id: 2,
    assignee_id: 3,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'personal',
    date_issued: '2026-08-01T00:00:00Z',
    date_expired: '2026-08-10T00:00:00Z',
    ...overrides,
  };
}

const issuerNames = new Map([
  [500001, 'Some Trader'],
  [500002, 'Jita Hauler'],
]);

describe('filterContracts', () => {
  it('returns every row unchanged when the filter is empty', () => {
    const rows = [contract({ contract_id: 1 }), contract({ contract_id: 2 })];
    expect(filterContracts(rows, EMPTY_CONTRACTS_FILTER, issuerNames)).toEqual(rows);
  });

  it('keeps only rows matching the selected status', () => {
    const rows = [
      contract({ contract_id: 1, status: 'outstanding' }),
      contract({ contract_id: 2, status: 'finished' }),
    ];
    const filter: ContractsFilter = { ...EMPTY_CONTRACTS_FILTER, status: 'outstanding' };
    expect(filterContracts(rows, filter, issuerNames).map((c) => c.contract_id)).toEqual([1]);
  });

  it('keeps only rows matching the selected type', () => {
    const rows = [
      contract({ contract_id: 1, type: 'item_exchange' }),
      contract({ contract_id: 2, type: 'courier' }),
    ];
    const filter: ContractsFilter = { ...EMPTY_CONTRACTS_FILTER, type: 'courier' };
    expect(filterContracts(rows, filter, issuerNames).map((c) => c.contract_id)).toEqual([2]);
  });

  it('matches free text against the issuer name, case-insensitively', () => {
    const rows = [
      contract({ contract_id: 1, issuer_id: 500001 }),
      contract({ contract_id: 2, issuer_id: 500002 }),
    ];
    const filter: ContractsFilter = { ...EMPTY_CONTRACTS_FILTER, text: 'trader' };
    expect(filterContracts(rows, filter, issuerNames).map((c) => c.contract_id)).toEqual([1]);
  });

  it('matches free text against the contract title, case-insensitively', () => {
    const rows = [
      contract({ contract_id: 1, title: 'Rifter fit' }),
      contract({ contract_id: 2, title: 'Cargo run' }),
    ];
    const filter: ContractsFilter = { ...EMPTY_CONTRACTS_FILTER, text: 'CARGO' };
    expect(filterContracts(rows, filter, issuerNames).map((c) => c.contract_id)).toEqual([2]);
  });

  it('combines every active criterion with AND', () => {
    const rows = [
      contract({ contract_id: 1, status: 'outstanding', type: 'item_exchange', title: 'match' }),
      contract({ contract_id: 2, status: 'outstanding', type: 'courier', title: 'match' }),
      contract({ contract_id: 3, status: 'finished', type: 'item_exchange', title: 'match' }),
    ];
    const filter: ContractsFilter = {
      status: 'outstanding',
      type: 'item_exchange',
      text: 'match',
    };
    expect(filterContracts(rows, filter, issuerNames).map((c) => c.contract_id)).toEqual([1]);
  });

  it('has no effect when the filter is empty even without a title', () => {
    const rows = [contract({ contract_id: 1, title: undefined })];
    expect(filterContracts(rows, EMPTY_CONTRACTS_FILTER, issuerNames)).toEqual(rows);
  });
});

describe('contractStatusOptions', () => {
  it('returns the distinct statuses present, in canonical order', () => {
    const rows = [
      contract({ status: 'finished' }),
      contract({ status: 'outstanding' }),
      contract({ status: 'outstanding' }),
    ];
    expect(contractStatusOptions(rows)).toEqual(['outstanding', 'finished']);
  });

  it('returns an empty array for no rows', () => {
    expect(contractStatusOptions([])).toEqual([]);
  });
});

describe('contractTypeOptions', () => {
  it('returns the distinct types present, in canonical order', () => {
    const rows = [contract({ type: 'courier' }), contract({ type: 'item_exchange' })];
    expect(contractTypeOptions(rows)).toEqual(['item_exchange', 'courier']);
  });

  it('returns an empty array for no rows', () => {
    expect(contractTypeOptions([])).toEqual([]);
  });
});
