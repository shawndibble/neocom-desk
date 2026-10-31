import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { DisplayRow } from './groupRows';
import { expandCombinedRows, taxCsvColumns, type TaxCsvContext } from './taxCsv';

const t = (k: string) => k;

function displayRow(overrides: Partial<DisplayRow> = {}): DisplayRow {
  return {
    key: 'a',
    row: {
      characterName: 'Miner One',
      entry: { date: '2026-09-04', solarSystemId: 1 },
      unassignedOreLines: [],
    },
    assignment: { id: 'a', payeeId: 'p', status: 'outstanding' },
    status: 'outstanding',
    ...overrides,
  } as unknown as DisplayRow;
}

const context: TaxCsvContext = {
  oreName: (id) => (id === 1230 ? 'Veldspar' : `#${id}`),
  securityOf: () => 0.4,
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
      'miningTax.csvSecurity',
      'miningTax.payeeColumn',
      'miningTax.labelColumn',
      'miningTax.oreColumn',
      'miningTax.estimatedValueColumn',
      'miningTax.taxOwedColumn',
      'miningTax.statusColumn',
      'miningTax.csvCombinedEntry',
      'miningTax.csvTaxPct',
      'miningTax.csvNeedsReview',
      'miningTax.csvCorpOverlap',
      'miningTax.csvCorrectedFrom',
    ]);
  });

  it('exports raw ISK numbers and the translated status', () => {
    const values = taxCsvColumns(t, context).map((c) =>
      c.value(
        displayRow({
          assignment: {
            id: 'a',
            payeeId: 'p',
            status: 'outstanding',
            label: 'Athanor',
            groupId: 'g1',
            taxPct: 10,
            oreLines: [{ typeId: 1230, quantity: 500 }],
          },
        } as unknown as Partial<DisplayRow>)
      )
    );
    expect(values).toEqual([
      'Miner One',
      '2026-09-04',
      'Jita',
      0.4,
      'Corp Tax',
      'Athanor',
      'Veldspar 500',
      1234567.5,
      123456.75,
      'miningTax.status.outstanding',
      'g1',
      10,
      'common.exportFlagNo',
      null,
      null,
    ]);
  });

  it('blanks tax owed on a row with no Assignment, rather than the table dash', () => {
    const csv = toCsv(
      [displayRow({ assignment: null, status: 'unassigned' })],
      taxCsvColumns(t, { ...context, taxOwed: () => null })
    );
    expect(csv.split('\r\n')[1]).toBe(
      '"Miner One","2026-09-04","Jita",0.4,"Corp Tax",,,1234567.5,,"miningTax.status.unassigned",,,"common.exportFlagNo",,'
    );
  });
});

describe('expandCombinedRows', () => {
  const member = (id: string, date: string, status: string) => ({
    row: { characterName: 'Miner One', entry: { date, solarSystemId: 1 } },
    assignment: { id, groupId: 'g1', status, taxOwed: 10, oreLines: [] },
  });

  it('turns a combined row into one row per member day, keeping ordinary rows', () => {
    const first = member('a', '2026-09-04', 'outstanding');
    const second = member('b', '2026-09-05', 'paid');
    const combined = displayRow({
      key: 'a',
      row: first.row,
      assignment: first.assignment,
      groupMembers: [second],
    } as unknown as Partial<DisplayRow>);
    const plain = displayRow({ key: 'z' });
    const out = expandCombinedRows([combined, plain]);
    expect(out.map((r) => r.key)).toEqual(['a', 'b', 'z']);
    expect(out[0].groupMembers).toBeUndefined();
    expect(out[1].status).toBe('paid');
    expect(out[1].row.entry.date).toBe('2026-09-05');
  });
});
