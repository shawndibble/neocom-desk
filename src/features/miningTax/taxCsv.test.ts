import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { DisplayRow } from './groupRows';
import { taxCsvColumns, type TaxCsvContext } from './taxCsv';

const t = (k: string) => k;

function displayRow(overrides: Partial<DisplayRow> = {}): DisplayRow {
  return {
    key: 'a',
    row: { characterName: 'Miner One', entry: { date: '2026-09-04', solarSystemId: 1 } },
    assignment: { id: 'a', payeeId: 'p', status: 'outstanding' },
    status: 'outstanding',
    ...overrides,
  } as unknown as DisplayRow;
}

const context: TaxCsvContext = {
  showCharacter: true,
  dateLabel: () => '2026-09-04',
  systemName: () => 'Jita',
  payeeName: () => 'Corp Tax',
  estimatedValue: () => 1234567.5,
  taxOwed: () => 123456.75,
};

describe('taxCsvColumns', () => {
  it('orders the columns as the table does, with the table header keys', () => {
    expect(taxCsvColumns(t, context).map((c) => c.header)).toEqual([
      'miningTax.characterColumn',
      'miningTax.dateColumn',
      'miningTax.systemColumn',
      'miningTax.payeeColumn',
      'miningTax.estimatedValueColumn',
      'miningTax.taxOwedColumn',
      'miningTax.statusColumn',
    ]);
  });

  it('drops Character when the table does', () => {
    expect(
      taxCsvColumns(t, { ...context, showCharacter: false }).map((c) => c.header)
    ).not.toContain('miningTax.characterColumn');
  });

  it('exports raw ISK numbers and the translated status', () => {
    const values = taxCsvColumns(t, context).map((c) => c.value(displayRow()));
    expect(values).toEqual([
      'Miner One',
      '2026-09-04',
      'Jita',
      'Corp Tax',
      1234567.5,
      123456.75,
      'miningTax.status.outstanding',
    ]);
  });

  it('blanks tax owed on a row with no Assignment, rather than the table dash', () => {
    const csv = toCsv(
      [displayRow({ assignment: null, status: 'unassigned' })],
      taxCsvColumns(t, { ...context, showCharacter: false, taxOwed: () => null })
    );
    expect(csv.split('\r\n')[1]).toBe(
      '"2026-09-04","Jita","Corp Tax",1234567.5,,"miningTax.status.unassigned"'
    );
  });
});
