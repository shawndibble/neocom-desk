import { describe, it, expect } from 'vitest';
import { membersCsvColumns } from './membersCsv';
import type { RosterRow } from './CorpRoster';

const t = (k: string) => k;

function row(overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    characterId: 1001,
    name: 'Jita Local',
    standing: {
      characterId: 1001,
      lastSeenMs: 1000,
      neverSeen: false,
      darkForMs: 500,
      isDark: false,
    },
    shipName: 'Rifter',
    shipTypeId: 587,
    locationName: 'Jita IV - Moon 4',
    locationId: 60003760,
    startMs: 2000,
    ...overrides,
  };
}

describe('membersCsvColumns', () => {
  it('orders columns member, last seen, ship, location, joined, using the i18n keys as headers', () => {
    const columns = membersCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'corp.members.columnMember',
      'corp.members.columnLastSeen',
      'corp.members.columnShip',
      'corp.members.columnLocation',
      'corp.members.columnJoined',
    ]);
  });

  it('falls back to the id, never a blank cell, for a name/ship/location that did not resolve', () => {
    const columns = membersCsvColumns(t);
    const unresolved = row({
      name: null,
      shipName: null,
      shipTypeId: 588,
      locationName: null,
      locationId: 60003761,
    });
    const values = Object.fromEntries(columns.map((c) => [c.header, c.value(unresolved)]));
    expect(values['corp.members.columnMember']).toBe('#1001');
    expect(values['corp.members.columnShip']).toBe('#588');
    expect(values['corp.members.columnLocation']).toBe('#60003761');
  });

  it('emits lastSeenMs and startMs as raw epoch ms, not a formatted string', () => {
    const columns = membersCsvColumns(t);
    const values = Object.fromEntries(columns.map((c) => [c.header, c.value(row())]));
    expect(values['corp.members.columnLastSeen']).toBe(1000);
    expect(values['corp.members.columnJoined']).toBe(2000);
  });

  it('emits null, not a placeholder, for a member with no ship/location id at all', () => {
    const columns = membersCsvColumns(t);
    const values = Object.fromEntries(
      columns.map((c) => [
        c.header,
        c.value(row({ shipName: null, shipTypeId: null, locationName: null, locationId: null })),
      ])
    );
    expect(values['corp.members.columnShip']).toBeNull();
    expect(values['corp.members.columnLocation']).toBeNull();
  });
});
