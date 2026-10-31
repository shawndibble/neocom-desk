import { describe, expect, it } from 'vitest';
import type { CsvColumn } from '@/lib/csv';
import type { XlsxSheet } from '@/lib/xlsx';
import type { SrpClaim } from '../srpClaimTypes';
import { srpExportSheets } from './srpExport';

const t = (key: string) => key;
const names = {
  type: (id: number) => `Type ${id}`,
  system: (id: number) => `System ${id}`,
  describe: () => 'summary',
};

function claim(overrides: Partial<SrpClaim> = {}): SrpClaim {
  return {
    killmailId: 1,
    corporationId: 9,
    characterId: 3,
    characterName: 'Pilot',
    hullTypeId: 587,
    solarSystemId: 30000142,
    killedAt: 1,
    filedAt: 2,
    state: 'paid',
    amount: 100,
    basis: null,
    suggested: null,
    fleetOrFc: null,
    note: null,
    refileCount: 0,
    ...overrides,
  };
}

function claimsTable(claims: SrpClaim[]) {
  const sheet = srpExportSheets(
    { settings: null, claims, audit: [], doctrines: [] },
    names,
    t
  ).find((s) => s.name === 'srp.export.sheets.claims') as XlsxSheet<SrpClaim>;
  const cols = sheet.columns as CsvColumn<SrpClaim>[];
  return {
    at: (row: SrpClaim, key: string) =>
      cols.find((c) => c.header === `srp.export.cols.${key}`)!.value(row),
  };
}

describe('srpExportSheets claims', () => {
  it('writes the killmail hash, how the amount was set and when an officer changed it', () => {
    const { at } = claimsTable([]);
    const row = claim({
      killmailHash: 'abc123',
      amountSource: 'override',
      overrideAt: Date.UTC(2026, 9, 1),
    });
    expect(at(row, 'killmailHash')).toBe('abc123');
    expect(at(row, 'amountSource')).toBe('srp.export.amountSource.override');
    expect(at(row, 'overrideAt')).toBe('2026-10-01T00:00:00.000Z');
    expect(at(claim(), 'amountSource')).toBeNull();
  });

  it('writes the Doctrine diff as counted modules and rigs, blank when there is none', () => {
    const { at } = claimsTable([]);
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
    expect(at(claim(), 'missingModules')).toBeNull();
  });
});
