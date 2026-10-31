import { describe, expect, it } from 'vitest';
import type { CsvColumn } from '@/lib/csv';
import type { XlsxSheet } from '@/lib/xlsx';
import type { BookSettings } from '../taxBook/bookClient';
import { bookExportSheets, type BookExportInput } from './bookExport';

const t = (key: string) => key;
const names = {
  character: (id: number) => `Char ${id}`,
  corporation: (id: number) => `Corp ${id}`,
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
  extractions: [
    {
      structureId: 900,
      moonId: 40,
      extractionStartTime: '2026-02-20T10:00:00Z',
      chunkArrivalTime: '2026-03-01T10:00:00Z',
      naturalDecayTime: '2026-03-01T13:00:00Z',
      laserFiredAt: '2026-03-01T11:00:00Z',
      oreLines: [
        { typeId: 45490, quantity: 1000 },
        { typeId: 45491, quantity: 50 },
      ],
    },
  ],
  declarations: [
    {
      id: 'd1',
      statementId: 's1',
      kind: 'contract',
      at: '2026-04-02T00:00:00Z',
      note: 'sent by contract',
      recordedBy: 3,
      resolution: { kind: 'confirmed', at: '2026-04-03T00:00:00Z', by: 7 },
    },
  ],
  rebills: [
    {
      id: 'r1',
      minerId: 'm1',
      fromDate: '2026-03-01',
      reason: 'rate fix',
      by: 7,
      at: '2026-04-05T00:00:00Z',
      memberRebill: true,
    },
  ],
  groupingAnswers: [
    {
      characterId: 2,
      minerId: 'm1',
      answer: 'confirmed',
      at: '2026-03-05T00:00:00Z',
      via: 'character',
    },
  ],
  declinedAutoGroup: [5],
  feeders: [
    {
      corporationId: 60,
      status: 'active',
      mode: 'normal',
      invitedBy: 7,
      joinedAt: Date.UTC(2026, 1, 1),
      lastReadWellAt: '2026-03-03T00:00:00.000Z',
      coveragePeriods: [{ from: '2026-02-01', to: '2026-02-28' }, { from: '2026-03-05' }],
      requestedRatePct: 8,
      agreedRatePct: 6,
      modeChanges: [{ from: '2026-03-01', mode: 'settled-otherwise' }],
      payee: { kind: 'character', id: 9 },
      ownerRateHistory: [
        { kind: 'agreed', pct: 6, effectiveFrom: '2026-02-10', recordedAt: '2026-02-10T00:00:00Z' },
        {
          kind: 'requested',
          pct: 8,
          effectiveFrom: '2026-02-01',
          recordedAt: '2026-02-01T00:00:00Z',
        },
      ],
      payouts: [
        {
          id: 'p2',
          date: '2026-03-10',
          amount: 500,
          method: 'donation',
          status: 'matched',
          journalRef: 123,
          notAPayout: false,
        },
        {
          id: 'p1',
          date: '2026-03-01',
          amount: 100,
          method: 'other',
          status: 'recorded',
          notAPayout: true,
        },
      ],
    },
  ],
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

const sheet = (name: string, from: BookExportInput = input) => {
  const found = bookExportSheets(from, names, t).find((s) => s.name === name);
  if (!found) throw new Error(`no sheet ${name}`);
  return table(found);
};

describe('bookExportSheets', () => {
  it('writes every record type, in the order the export lists them', () => {
    expect(bookExportSheets(input, names, t).map((s) => s.name)).toEqual([
      'corpTaxBook.export.sheets.miningLines',
      'corpTaxBook.export.sheets.statements',
      'corpTaxBook.export.sheets.statementLines',
      'corpTaxBook.export.sheets.payments',
      'corpTaxBook.export.sheets.adjustments',
      'corpTaxBook.export.sheets.writeOffs',
      'corpTaxBook.export.sheets.dismissals',
      'corpTaxBook.export.sheets.declarations',
      'corpTaxBook.export.sheets.rebills',
      'corpTaxBook.export.sheets.miners',
      'corpTaxBook.export.sheets.groupingAnswers',
      'corpTaxBook.export.sheets.extractions',
      'corpTaxBook.export.sheets.moonOwners',
      'corpTaxBook.export.sheets.moonOwnerPayments',
      'corpTaxBook.export.sheets.moonOwnerRates',
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

  it('writes every Statement line with its ore, price, rate and tax, and the mail facts on the Statement', () => {
    const withLines: BookExportInput = {
      ...input,
      statements: [
        {
          ...input.statements[0],
          mailsSent: 2,
          lastMailedAt: '2026-04-02T00:00:00Z',
          issuedBy: 7,
          remindersStopped: true,
          manualRemindersSent: 1,
          minerName: 'Pilot',
          lines: [
            {
              kind: 'mined',
              date: '2026-03-01',
              characterId: 3,
              structureId: 900,
              oreLines: [{ typeId: 45490, quantity: 10 }],
              unitPrices: { 45490: 5.5 },
              priceSources: { 45490: 'live' },
              taxPct: 10,
              rateEffectiveFrom: '2026-01-01',
              estimatedValue: 55,
              tax: 5.5,
            },
            {
              kind: 'correction',
              date: '2026-03-02',
              oreLines: [],
              estimatedValue: 0,
              tax: -1,
              reason: 'fix',
            },
          ],
        },
      ],
    };
    const [lh, first, second] = sheet('corpTaxBook.export.sheets.statementLines', withLines);
    const line = (row: unknown[], col: string) => row[lh.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(line(first, 'statementId')).toBe('s1');
    expect(line(first, 'character')).toBe('Char 3');
    expect(line(first, 'refinery')).toBe('Refinery 900');
    expect(line(first, 'ore')).toBe('Ore 45490 × 10');
    expect(line(first, 'unitPrices')).toBe('Ore 45490: 5.5');
    expect(line(first, 'priceSources')).toBe('Ore 45490: corpTaxBook.export.priceSource.live');
    expect([line(first, 'taxPct'), line(first, 'estimatedValue'), line(first, 'tax')]).toEqual([
      10, 55, 5.5,
    ]);
    expect(line(second, 'kind')).toBe('corpTaxBook.export.lineKind.correction');
    expect(line(second, 'reason')).toBe('fix');
    expect(line(second, 'character')).toBeNull();
    const [sh, srow] = sheet('corpTaxBook.export.sheets.statements', withLines);
    const at = (col: string) => srow[sh.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect([
      at('mailsSent'),
      at('lastMailed'),
      at('issuedBy'),
      at('manualReminders'),
      at('storedMinerName'),
    ]).toEqual([2, '2026-04-02T00:00:00Z', 'Char 7', 1, 'Pilot']);
    expect(at('remindersStopped')).toBe('corpTaxBook.export.yes');
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

  it('writes a moon owner per row: name beside id, status, rates, coverage and real date cells', () => {
    const [header, row] = sheet('corpTaxBook.export.sheets.moonOwners');
    const at = (col: string) => row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at('moonOwner')).toBe('Corp 60');
    expect(at('moonOwnerId')).toBe(60);
    expect(at('status')).toBe('corpTaxBook.export.moonOwnerStatus.active');
    expect(at('mode')).toBe('corpTaxBook.export.moonOwnerMode.normal');
    expect(at('modeChanges')).toBe(
      '2026-03-01: corpTaxBook.export.moonOwnerMode.settled-otherwise'
    );
    expect(at('joined')).toBe('2026-02-01T00:00:00.000Z');
    expect(at('left')).toBeNull();
    expect(at('invitedBy')).toBe('Char 7');
    expect(at('invitedById')).toBe(7);
    expect(at('payee')).toBe('Char 9');
    expect(at('payeeId')).toBe(9);
    expect(at('requestedRate')).toBe(8);
    expect(at('agreedRate')).toBe(6);
    expect(at('coverage')).toBe('2026-02-01 – 2026-02-28; 2026-03-05 –');
    expect(at('lastReadWell')).toBe('2026-03-03T00:00:00.000Z');
  });

  it("writes every moon owner's payments, oldest first, with the moon owner named", () => {
    const [header, first, second] = sheet('corpTaxBook.export.sheets.moonOwnerPayments');
    const at = (row: unknown[], col: string) =>
      row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at(first, 'paymentId')).toBe('p1');
    expect(at(first, 'moonOwner')).toBe('Corp 60');
    expect(at(first, 'moonOwnerId')).toBe(60);
    expect(at(first, 'date')).toBe('2026-03-01');
    expect(at(first, 'method')).toBe('corpTaxBook.moons.moonOwners.page.payouts.method.other');
    expect(at(first, 'notAPayout')).toBe('corpTaxBook.export.yes');
    expect(at(second, 'amount')).toBe(500);
    expect(at(second, 'status')).toBe('corpTaxBook.moons.moonOwners.page.payouts.state.matched');
    expect(at(second, 'journalRef')).toBe(123);
    expect(at(second, 'notAPayout')).toBe('corpTaxBook.export.no');
  });

  it("writes each moon owner's rate history, oldest first", () => {
    const [header, first, second] = sheet('corpTaxBook.export.sheets.moonOwnerRates');
    const at = (row: unknown[], col: string) =>
      row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at(first, 'moonOwner')).toBe('Corp 60');
    expect(at(first, 'kind')).toBe('corpTaxBook.export.rateKind.requested');
    expect(at(first, 'ratePct')).toBe(8);
    expect(at(first, 'effectiveFrom')).toBe('2026-02-01');
    expect(at(second, 'kind')).toBe('corpTaxBook.export.rateKind.agreed');
    expect(at(second, 'time')).toBe('2026-02-10T00:00:00Z');
  });

  it('derives the rates and mode of a moon owner recorded before their histories were kept', () => {
    const legacy = {
      ...input.feeders[0],
      mode: 'settled-otherwise' as const,
      ownerRateHistory: undefined,
      modeChanges: undefined,
    };
    const from = { ...input, feeders: [legacy] };
    const rates = sheet('corpTaxBook.export.sheets.moonOwnerRates', from);
    expect(rates.slice(1).map((r) => [r[2], r[3], r[4]])).toEqual([
      ['corpTaxBook.export.rateKind.requested', 8, '2026-02-01'],
      ['corpTaxBook.export.rateKind.agreed', 6, '2026-02-01'],
    ]);
    const owners = sheet('corpTaxBook.export.sheets.moonOwners', from);
    expect(owners[1][owners[0].indexOf('corpTaxBook.export.cols.modeChanges')]).toBe(
      '2026-02-01: corpTaxBook.export.moonOwnerMode.settled-otherwise'
    );
  });

  it('writes an extraction with the refinery, moon and ore named beside their ids', () => {
    const [header, row] = sheet('corpTaxBook.export.sheets.extractions');
    const at = (col: string) => row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at('refinery')).toBe('Refinery 900');
    expect(at('refineryId')).toBe(900);
    expect(at('moon')).toBe('Moon 40');
    expect(at('moonId')).toBe(40);
    expect(at('started')).toBe('2026-02-20T10:00:00Z');
    expect(at('chunkArrival')).toBe('2026-03-01T10:00:00Z');
    expect(at('laserFired')).toBe('2026-03-01T11:00:00Z');
    expect(at('cancelled')).toBeUndefined();
    expect(at('ore')).toBe('Ore 45490 × 1000; Ore 45491 × 50');
  });

  it("writes a declaration with the Statement's Miner and who recorded and resolved it", () => {
    const [header, row] = sheet('corpTaxBook.export.sheets.declarations');
    const at = (col: string) => row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at('declarationId')).toBe('d1');
    expect(at('statementId')).toBe('s1');
    expect(at('miner')).toBe('Char 3');
    expect(at('minerId')).toBe('solo:3');
    expect(at('kind')).toBe('corpTaxBook.export.declarationKind.contract');
    expect(at('time')).toBe('2026-04-02T00:00:00Z');
    expect(at('recordedBy')).toBe('Char 3');
    expect(at('resolution')).toBe('corpTaxBook.export.resolution.confirmed');
    expect(at('resolvedAt')).toBe('2026-04-03T00:00:00Z');
    expect(at('resolvedBy')).toBe('Char 7');
  });

  it('writes a rebill with the Miner and officer named', () => {
    const [header, row] = sheet('corpTaxBook.export.sheets.rebills');
    const at = (col: string) => row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at('rebillId')).toBe('r1');
    expect(at('miner')).toBe('Char 1');
    expect(at('fromDate')).toBe('2026-03-01');
    expect(at('by')).toBe('Char 7');
    expect(at('memberRebill')).toBe('corpTaxBook.export.yes');
  });

  it("writes a guest's grouping answer with the character and Miner named", () => {
    const [header, row] = sheet('corpTaxBook.export.sheets.groupingAnswers');
    const at = (col: string) => row[header.indexOf(`corpTaxBook.export.cols.${col}`)];
    expect(at('character')).toBe('Char 2');
    expect(at('miner')).toBe('Char 1');
    expect(at('answer')).toBe('corpTaxBook.export.groupingAnswer.confirmed');
    expect(at('via')).toBe('corpTaxBook.export.answerVia.character');
  });

  it('lists the characters left out of automatic grouping on the Settings sheet', () => {
    const rows = sheet('corpTaxBook.export.sheets.settings').slice(1);
    expect(rows).toContainEqual(['corpTaxBook.export.setting.declinedAutoGroup', 'Char 5']);
  });

  it('writes each feeder sheet with only its header row when the book has no such records', () => {
    const empty: BookExportInput = {
      ...input,
      extractions: [],
      declarations: [],
      rebills: [],
      groupingAnswers: [],
      declinedAutoGroup: [],
      feeders: [],
    };
    const sheets = bookExportSheets(empty, names, t);
    for (const name of [
      'declarations',
      'rebills',
      'groupingAnswers',
      'extractions',
      'moonOwners',
      'moonOwnerPayments',
      'moonOwnerRates',
    ]) {
      const found = sheets.find((s) => s.name === `corpTaxBook.export.sheets.${name}`);
      expect(found?.rows).toEqual([]);
      expect(found?.columns.length).toBeGreaterThan(0);
    }
  });
});
