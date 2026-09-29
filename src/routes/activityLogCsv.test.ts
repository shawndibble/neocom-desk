import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';
import { ENDPOINT_ROUTES } from '@/esi/endpointRoutes';
import type { EsiEndpointId } from '@/esi/registry';
import type { ActivityLogEntry } from '@/stores/activityLog';
import { activityLogCsvColumns, dataAgeCsvColumns } from './activityLogCsv';

const t = (k: string) => k;
const endpointId = Object.keys(ENDPOINT_ROUTES)[0] as EsiEndpointId;
const names = new Map([[90000001, 'Pilot One']]);
const TIMESTAMP = Date.UTC(2026, 8, 29, 14, 5, 6);

function entry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: 1,
    endpointId,
    characterId: 90000001,
    timestamp: TIMESTAMP,
    outcome: 'success',
    ...overrides,
  };
}

describe('activityLogCsvColumns', () => {
  it('exports endpoint route, character, time as a real date, and outcome', () => {
    const columns = activityLogCsvColumns(t, names);
    expect(columns.map((c) => c.header)).toEqual([
      'activityLog.columnEndpoint',
      'activityLog.columnCharacter',
      'activityLog.columnTime',
      'activityLog.columnOutcome',
    ]);
    expect(columns.map((c) => c.value(entry({ outcome: 'authFailure' })))).toEqual([
      ENDPOINT_ROUTES[endpointId],
      'Pilot One',
      '2026-09-29T14:05:06.000Z',
      'activityLog.outcomeAuthFailure',
    ]);
    // The ISO form lands as a spreadsheet date-time, not text.
    expect(toCsv([entry()], columns).split('\r\n')[1]).toContain(',2026-09-29 14:05:06,');
  });

  it('labels a public call and an unknown character as the table does', () => {
    const character = activityLogCsvColumns(t, names)[1];
    expect(character.value(entry({ characterId: undefined }))).toBe('activityLog.publicCall');
    expect(character.value(entry({ characterId: 42 }))).toBe('#42');
  });
});

describe('dataAgeCsvColumns', () => {
  it('exports the update time itself, not the relative age the table shows', () => {
    const columns = dataAgeCsvColumns(t, names);
    expect(columns.map((c) => c.header)).toEqual([
      'dataAge.columnEndpoint',
      'dataAge.columnCharacter',
      'dataAge.columnUpdated',
    ]);
    expect(columns.map((c) => c.value(entry()))).toEqual([
      ENDPOINT_ROUTES[endpointId],
      'Pilot One',
      '2026-09-29T14:05:06.000Z',
    ]);
  });
});
