import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { Contract } from '@/esi/endpoints';
import { contractsCsvColumns } from './contractsCsv';

const t = (k: string) => k;
const nameFor = (id: number) => `Issuer ${id}`;

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    contract_id: 1,
    issuer_id: 100,
    issuer_corporation_id: 200,
    assignee_id: 300,
    acceptor_id: 400,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'public',
    date_issued: '2026-08-20T12:00:00Z',
    date_expired: '2026-08-29T12:00:00Z',
    ...overrides,
  };
}

describe('contractsCsvColumns', () => {
  it('orders columns type, status, issuer, price, expires', () => {
    const columns = contractsCsvColumns(t, nameFor);
    expect(columns.map((c) => c.header)).toEqual([
      'contracts.type',
      'contracts.status',
      'contracts.issuer',
      'contracts.price',
      'contracts.expires',
    ]);
  });

  it('prefers title over type when a title is set', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const typeColumn = columns.find((c) => c.header === 'contracts.type')!;
    expect(typeColumn.value(contract({ title: 'Fuel run', type: 'courier' }))).toBe('Fuel run');
    expect(typeColumn.value(contract({ title: undefined, type: 'courier' }))).toBe('courier');
  });

  it('resolves the issuer name via nameFor', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const issuerColumn = columns.find((c) => c.header === 'contracts.issuer')!;
    expect(issuerColumn.value(contract({ issuer_id: 555 }))).toBe('Issuer 555');
  });

  it('falls back from price to reward, and null when neither is present', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const priceColumn = columns.find((c) => c.header === 'contracts.price')!;
    expect(priceColumn.value(contract({ price: 1000, reward: undefined }))).toBe(1000);
    expect(priceColumn.value(contract({ price: undefined, reward: 500 }))).toBe(500);
    expect(priceColumn.value(contract({ price: undefined, reward: undefined }))).toBeNull();
  });

  it('emits a blank cell (not a string) when neither price nor reward is present', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const row = contract({ price: undefined, reward: undefined });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[3]).toBe('');
  });

  it('passes expires through unchanged as a raw ISO string', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const expiresColumn = columns.find((c) => c.header === 'contracts.expires')!;
    expect(expiresColumn.value(contract({ date_expired: '2026-09-01T00:00:00Z' }))).toBe(
      '2026-09-01T00:00:00Z'
    );
  });
});
