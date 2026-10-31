import { describe, expect, it } from 'vitest';
import type { CsvColumn } from '@/lib/csv';
import type { XlsxSheet } from '@/lib/xlsx';
import type { SrpClaim } from '../srpClaimTypes';
import type { SrpSettings } from '../srpTypes';
import { srpExportSheets, type SrpExportInput } from './srpExport';

const t = (key: string) => key;
const names = {
  type: (id: number) => `Type ${id}`,
  system: (id: number) => `System ${id}`,
  describe: () => 'summary',
};

const settings: SrpSettings = {
  corporationId: 98000001,
  enabled: true,
  killmailPct: 80,
  appraisalPct: null,
  hullRules: [
    { scope: 'hull', id: 587, kind: 'pay-fixed', iskAmount: 5_000_000, doctrineIds: ['d1'] },
    { scope: 'class', id: 26, kind: 'not-covered' },
  ],
  windowDays: 30,
  requireFleetOrFc: true,
  createdBy: 7,
  createdAt: Date.UTC(2026, 0, 1),
  ownerCharacterId: 7,
  updatedAt: Date.UTC(2026, 1, 1),
  updatedBy: 7,
};

const claim = (over: Partial<SrpClaim>): SrpClaim => ({
  killmailId: 1,
  corporationId: 98000001,
  characterId: 11,
  characterName: 'Pilot',
  hullTypeId: 587,
  solarSystemId: 30000142,
  killedAt: Date.UTC(2026, 2, 1),
  filedAt: Date.UTC(2026, 2, 2),
  state: 'pending',
  amount: 5_000_000,
  basis: { step: 'hull-fixed' },
  suggested: null,
  fleetOrFc: 'Fleet A',
  note: null,
  refileCount: 0,
  ...over,
});

const input: SrpExportInput = {
  settings,
  claims: [
    claim({
      killmailId: 2,
      state: 'paid',
      filedAt: Date.UTC(2026, 2, 3),
      paidAt: 1,
      paidByName: 'Off',
    }),
    claim({ killmailId: 1, doctrineCheck: { status: 'matched', doctrineName: 'Rifter' } }),
  ],
  audit: [
    {
      id: 'e1',
      at: Date.UTC(2026, 2, 4),
      by: 7,
      byName: 'Off',
      action: 'paid',
      detail: { killmailId: 2 },
    },
  ],
  doctrines: [
    {
      id: 'd1',
      name: 'Rifter',
      snapshot: { hullTypeId: 587, name: 'Rifter', modules: [10, 10, 20], rigs: [30] },
      createdBy: 7,
      createdAt: Date.UTC(2026, 0, 2),
    },
  ],
};

function table(sheet: XlsxSheet<unknown>): unknown[][] {
  const cols = sheet.columns as CsvColumn<unknown>[];
  return [cols.map((c) => c.header), ...sheet.rows.map((r) => cols.map((c) => c.value(r)))];
}

const sheet = (name: string) => {
  const found = srpExportSheets(input, names, t).find((s) => s.name === name);
  if (!found) throw new Error(`no sheet ${name}`);
  return table(found);
};

describe('srpExportSheets', () => {
  it('writes Settings, every claim, the log and the Doctrine Fits, in that order', () => {
    expect(srpExportSheets(input, names, t).map((s) => s.name)).toEqual([
      'srp.export.sheets.settings',
      'srp.export.sheets.claims',
      'srp.export.sheets.log',
      'srp.export.sheets.doctrines',
    ]);
  });

  it('writes every claim whatever its state, oldest filing first, times as UTC timestamps', () => {
    const [header, first, second] = sheet('srp.export.sheets.claims');
    const at = (row: unknown[], col: string) => row[header.indexOf(`srp.export.cols.${col}`)];
    expect(at(first, 'killmailId')).toBe(1);
    expect(at(first, 'state')).toBe('srp.export.state.pending');
    expect(at(first, 'hull')).toBe('Type 587');
    expect(at(first, 'system')).toBe('System 30000142');
    expect(at(first, 'filed')).toBe('2026-03-02T00:00:00.000Z');
    expect(at(first, 'doctrineCheck')).toBe('srp.export.doctrine.matched');
    expect(at(first, 'doctrineFit')).toBe('Rifter');
    expect(at(second, 'state')).toBe('srp.export.state.paid');
    expect(at(second, 'paidBy')).toBe('Off');
  });

  it('writes the settings one per row, a row per Hull Rule', () => {
    const rows = sheet('srp.export.sheets.settings').slice(1);
    expect(rows).toContainEqual(['srp.export.setting.killmailPct', 80]);
    expect(rows).toContainEqual(['srp.export.setting.appraisalPct', null]);
    expect(rows).toContainEqual(['srp.export.setting.hullRule', 'srp.export.rule.pay-fixed']);
    expect(rows).toContainEqual(['srp.export.setting.hullRule', 'srp.export.rule.not-covered']);
  });

  it('writes a log line with its summary and the raw detail', () => {
    const [header, row] = sheet('srp.export.sheets.log');
    expect(row[header.indexOf('srp.export.cols.summary')]).toBe('summary');
    expect(row[header.indexOf('srp.export.cols.killmailId')]).toBe(2);
    expect(row[header.indexOf('srp.export.cols.time')]).toBe('2026-03-04T00:00:00.000Z');
  });

  it('lists a Doctrine Fit with its modules and rigs counted by name', () => {
    const [header, row] = sheet('srp.export.sheets.doctrines');
    expect(row[header.indexOf('srp.export.cols.hull')]).toBe('Type 587');
    expect(row[header.indexOf('srp.export.cols.modules')]).toBe('2x Type 10; 1x Type 20');
    expect(row[header.indexOf('srp.export.cols.rigs')]).toBe('1x Type 30');
  });
});

function diffTable() {
  return {
    at: (row: SrpClaim, key: string) => {
      const found = srpExportSheets({ ...input, claims: [row] }, names, t).find(
        (s) => s.name === 'srp.export.sheets.claims'
      ) as XlsxSheet<SrpClaim>;
      const cols = found.columns as CsvColumn<SrpClaim>[];
      return cols.find((c) => c.header === `srp.export.cols.${key}`)!.value(row);
    },
  };
}

describe('srpExportSheets claims', () => {
  it('writes the killmail hash, how the amount was set and when an officer changed it', () => {
    const { at } = diffTable();
    const row = claim({
      killmailHash: 'abc123',
      amountSource: 'override',
      overrideAt: Date.UTC(2026, 9, 1),
    });
    expect(at(row, 'killmailHash')).toBe('abc123');
    expect(at(row, 'amountSource')).toBe('srp.export.amountSource.override');
    expect(at(row, 'overrideAt')).toBe('2026-10-01T00:00:00.000Z');
    expect(at(claim({}), 'amountSource')).toBeNull();
  });

  it('writes the Doctrine diff as counted modules and rigs, blank when there is none', () => {
    const { at } = diffTable();
    const row = claim({
      doctrineCheck: {
        status: 'off-doctrine',
        diff: { missingModules: [1, 1, 2], extraModules: [3], missingRigs: [], extraRigs: [4] },
      },
    });
    expect(at(row, 'missingModules')).toBe('2x Type 1; 1x Type 2');
    expect(at(row, 'extraModules')).toBe('1x Type 3');
    expect(at(row, 'missingRigs')).toBeNull();
    expect(at(row, 'extraRigs')).toBe('1x Type 4');
    expect(at(claim({}), 'missingModules')).toBeNull();
  });
});
