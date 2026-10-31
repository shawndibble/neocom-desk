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
  it('exports every column the table can show plus the courier route and deadline', () => {
    const columns = contractsCsvColumns(t, nameFor, undefined, () => 'Alpha');
    expect(columns.map((c) => c.header)).toEqual([
      'contracts.type',
      'contracts.csvTitle',
      'contracts.character',
      'contracts.status',
      'contracts.issuer',
      'contracts.receiver',
      'contracts.price',
      'contracts.csvCollateral',
      'contracts.issued',
      'contracts.expires',
      'contracts.csvCourierStart',
      'contracts.csvCourierEnd',
      'contracts.csvCourierDeadline',
    ]);
  });

  it('leaves the character column out when nothing names the owner', () => {
    expect(contractsCsvColumns(t, nameFor).map((c) => c.header)).not.toContain(
      'contracts.character'
    );
  });

  it('exports the type and status as the table labels them, not the ESI slug', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const at = (header: string, c: Contract) => columns.find((x) => x.header === header)!.value(c);
    expect(at('contracts.type', contract({ type: 'courier' }))).toBe('contracts.typeCourier');
    expect(at('contracts.status', contract({ status: 'finished_issuer' }))).toBe(
      'contracts.statusFinishedIssuer'
    );
    expect(at('contracts.issued', contract())).toBe('2026-08-20T12:00:00Z');
  });

  it('exports a courier route ids and delivery deadline, blank for other contracts', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const at = (header: string, c: Contract) => columns.find((x) => x.header === header)!.value(c);
    const courier = contract({
      type: 'courier',
      status: 'in_progress',
      start_location_id: 60003760,
      end_location_id: 60008494,
      collateral: 1_000_000,
      days_to_complete: 3,
      date_accepted: '2026-08-21T00:00:00Z',
    });
    expect(at('contracts.csvCourierStart', courier)).toBe(60003760);
    expect(at('contracts.csvCourierEnd', courier)).toBe(60008494);
    expect(at('contracts.csvCourierDeadline', courier)).toBe('2026-08-24T00:00:00.000Z');
    expect(at('contracts.csvCollateral', courier)).toBe(1_000_000);
    expect(at('contracts.csvCourierDeadline', contract())).toBeNull();
    expect(at('contracts.csvCourierStart', contract({ start_location_id: 5 }))).toBeNull();
  });

  it('names the receiver, blank when none or the pilot', () => {
    const col = contractsCsvColumns(t, nameFor, 100).find(
      (c) => c.header === 'contracts.receiver'
    )!;
    expect(col.value(contract({ acceptor_id: 400 }))).toBe('Issuer 400');
    expect(col.value(contract({ acceptor_id: 0, assignee_id: 0 }))).toBeNull();
    expect(col.value(contract({ acceptor_id: 100 }))).toBeNull();
  });

  it('exports the title in its own column, blank when none is set', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const titleColumn = columns.find((c) => c.header === 'contracts.csvTitle')!;
    expect(titleColumn.value(contract({ title: 'Fuel run', type: 'courier' }))).toBe('Fuel run');
    expect(titleColumn.value(contract({ title: undefined, type: 'courier' }))).toBeNull();
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

  it('exports a courier reward, not its price of 0', () => {
    const priceColumn = contractsCsvColumns(t, nameFor).find(
      (c) => c.header === 'contracts.price'
    )!;
    expect(priceColumn.value(contract({ type: 'courier', price: 0, reward: 45_000_000 }))).toBe(
      45_000_000
    );
  });

  it('emits a blank cell (not a string) when neither price nor reward is present', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const row = contract({ price: undefined, reward: undefined });
    const csv = toCsv([row], columns);
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[6]).toBe('');
  });

  it('passes expires through unchanged as a raw ISO string', () => {
    const columns = contractsCsvColumns(t, nameFor);
    const expiresColumn = columns.find((c) => c.header === 'contracts.expires')!;
    expect(expiresColumn.value(contract({ date_expired: '2026-09-01T00:00:00Z' }))).toBe(
      '2026-09-01T00:00:00Z'
    );
  });

  it('exports the full expiry timestamp, not a date alone', () => {
    const col = contractsCsvColumns(t, nameFor).find((c) => c.header === 'contracts.expires')!;
    expect(col.value(contract())).toBe('2026-08-29T12:00:00Z');
  });
});
