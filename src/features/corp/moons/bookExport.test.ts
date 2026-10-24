import { describe, expect, it } from 'vitest';
import type { CsvColumn } from '@/lib/csv';
import type { XlsxSheet } from '@/lib/xlsx';
import type { BookSettings } from '../taxBook/bookClient';
import { bookExportSheets, type BookExportInput } from './bookExport';

const t = (key: string) => key;
const names = {
  character: (id: number) => `Char ${id}`,
  refinery: (id: number) => `Refinery ${id}`,
  moon: (id: number) => `Moon ${id}`,
  ore: (id: number) => `Ore ${id}`,
};

const settings: BookSettings = {
  active: true,
  startDate: '2026-01-01',
  divisions: [1, 3],
  lastSync: null,
  structureExpiryHours: {},
  hubId: 'jita',
  oreForm: 'compressed',
  graceHours: 6,
  minimumStatement: 5_000_000,
  overdueDays: 14,
  cadence: { kind: 'monthly' },
  chunkM3PerHour: null,
  rates: [
    { scope: 'corp', pct: 10, effectiveFrom: '2026-01-01' },
    { scope: 'miner', minerId: 'm1', pct: 5, effectiveFrom: '2026-02-01' },
  ],
  dismissApprovalAboveIsk: null,
  ownerCharacterId: 7,
  createdBy: 7,
};

const input: BookExportInput = {
  settings,
  miners: [{ id: 'm1', characterIds: [1, 2], mainCharacterId: 1 }],
  observed: [
    {
      structureId: 900,
      characterId: 2,
      recordedCorporationId: 50,
      typeId: 45490,
      date: '2026-03-02',
      quantity: 1200,
      cachedAt: '2026-03-02T11:00:00Z',
      moonId: 40,
    },
    {
      structureId: 900,
      characterId: 3,
      recordedCorporationId: 60,
      typeId: 45490,
      date: '2026-03-01',
      quantity: 10,
      cachedAt: '2026-03-01T11:00:00Z',
    },
  ],
  statements: [
    {
      id: 's1',
      minerId: 'solo:3',
      code: 'ABC',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      coversFrom: '2026-03-01',
      coversThrough: '2026-03-31',
      issuedAt: '2026-04-01T00:00:00Z',
      hubId: 'jita',
      oreForm: 'compressed',
      lines: [],
      amount: 1000,
    },
  ],
  paidStatementIds: new Set(['s1']),
  payments: [],
  adjustments: [],
  writeOffs: [],
  dismissals: [],
  audit: [
    {
      id: 'a1',
      at: Date.UTC(2026, 3, 1, 12),
      by: 7,
      byName: 'Officer',
      action: 'settleStatements',
      detail: { reason: 'paid in a contract' },
    },
  ],
};

/** The sheet's cells as plain values, header row first. */
function table(sheet: XlsxSheet<unknown>): unknown[][] {
  const cols = sheet.columns as CsvColumn<unknown>[];
  return [cols.map((c) => c.header), ...sheet.rows.map((r) => cols.map((c) => c.value(r)))];
}

const sheet = (name: string) => {
  const found = bookExportSheets(input, names, t).find((s) => s.name === name);
  if (!found) throw new Error(`no sheet ${name}`);
  return table(found);
};

describe('bookExportSheets', () => {
  it('writes the nine record types, in the order the export lists them', () => {
    expect(bookExportSheets(input, names, t).map((s) => s.name)).toEqual([
      'corpTaxBook.export.sheets.miningLines',
      'corpTaxBook.export.sheets.statements',
      'corpTaxBook.export.sheets.payments',
      'corpTaxBook.export.sheets.adjustments',
      'corpTaxBook.export.sheets.writeOffs',
      'corpTaxBook.export.sheets.dismissals',
      'corpTaxBook.export.sheets.miners',
      'corpTaxBook.export.sheets.settings',
      'corpTaxBook.export.sheets.activity',
    ]);
  });

  it('writes a mining line per observed row, oldest first, names beside ids and the Miner it bills', () => {
    const [header, first, second] = sheet('corpTaxBook.export.sheets.miningLines');
    const at = (row: unknown[], col: string) =>
      row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at(first, 'date')).toBe('2026-03-01');
    expect(at(first, 'character')).toBe('Char 3');
    expect(at(first, 'miner')).toBe('Char 3');
    expect(at(first, 'moon')).toBeNull();
    expect(at(second, 'characterId')).toBe(2);
    expect(at(second, 'miner')).toBe('Char 1');
    expect(at(second, 'minerId')).toBe('m1');
    expect(at(second, 'refinery')).toBe('Refinery 900');
    expect(at(second, 'moon')).toBe('Moon 40');
    expect(at(second, 'ore')).toBe('Ore 45490');
    expect(at(second, 'quantity')).toBe(1200);
  });

  it('marks a settled Statement and names a solo Miner by its one character', () => {
    const [header, row] = sheet('corpTaxBook.export.sheets.statements');
    const at = (col: string) => row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at('miner')).toBe('Char 3');
    expect(at('settled')).toBe('corpTaxBook.export.yes');
    expect(at('amount')).toBe(1000);
    expect(at('issued')).toBe('2026-04-01T00:00:00Z');
  });

  it('lists a Miner with every character it groups', () => {
    const [header, row] = sheet('corpTaxBook.export.sheets.miners');
    const at = (col: string) => row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at('characters')).toBe('Char 1; Char 2');
    expect(at('characterIds')).toBe('1; 2');
  });

  it('writes the settings as one row each, a row per tax rate', () => {
    const rows = sheet('corpTaxBook.export.sheets.settings').slice(1);
    expect(rows).toContainEqual(['corpTaxBook.export.setting.startDate', '2026-01-01']);
    expect(rows).toContainEqual(['corpTaxBook.export.setting.divisions', '1; 3']);
    expect(rows).toContainEqual(['corpTaxBook.export.setting.rate.corp', 10]);
    expect(rows.find((r) => r[1] === 5)?.[0]).toBe('corpTaxBook.export.setting.rate.miner');
  });

  it('writes audit times as UTC timestamps, so they land as date cells', () => {
    const [header, row] = sheet('corpTaxBook.export.sheets.activity');
    expect(row[header.indexOf('corpTaxBook.export.cols.time')]).toBe('2026-04-01T12:00:00.000Z');
    expect(row[header.indexOf('corpTaxBook.export.cols.detail')]).toBe(
      '{"reason":"paid in a contract"}'
    );
  });
});
