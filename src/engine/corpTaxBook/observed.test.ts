import { describe, it, expect } from 'vitest';
import { groupObservedEntries, mergeObservedRows, observedRowKey } from './observed';
import type { ObservedRow } from './types';

const ORE_A = 45490;
const ORE_B = 45491;
const ATHANOR = 1_000_000_000_001;
const TATARA = 1_000_000_000_002;

function row(overrides: Partial<ObservedRow> = {}): ObservedRow {
  return {
    structureId: ATHANOR,
    characterId: 90000001,
    recordedCorporationId: 98000001,
    typeId: ORE_A,
    date: '2026-07-12',
    quantity: 1000,
    cachedAt: '2026-07-12T10:00:00Z',
    ...overrides,
  };
}

describe('mergeObservedRows', () => {
  it('adds a row it has never seen', () => {
    const { rows, changed } = mergeObservedRows([], [row()]);
    expect(rows).toEqual([row()]);
    expect(changed).toEqual([row()]);
  });

  it('keys rows by miner + ore + day + structure, so each of those keeps its own row', () => {
    const fresh = [
      row(),
      row({ characterId: 90000002 }),
      row({ typeId: ORE_B }),
      row({ date: '2026-07-13' }),
      row({ structureId: TATARA }),
    ];
    const { rows } = mergeObservedRows([], fresh);
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map(observedRowKey)).size).toBe(5);
  });

  it('upserts a growing quantity rather than appending a second row', () => {
    const later = row({ quantity: 2500, cachedAt: '2026-07-12T12:00:00Z' });
    const { rows, changed } = mergeObservedRows([row()], [later]);
    expect(rows).toEqual([later]);
    expect(changed).toEqual([later]);
  });

  it('never lets a quantity go down', () => {
    const existing = row({ quantity: 2500 });
    const smaller = row({ quantity: 1200, cachedAt: '2026-07-12T12:00:00Z' });
    const { rows, changed } = mergeObservedRows([existing], [smaller]);
    expect(rows[0].quantity).toBe(2500);
    expect(changed).toEqual([]);
  });

  it('ignores a row from an ESI cache older than the one already stored', () => {
    const existing = row({ quantity: 1000, cachedAt: '2026-07-12T12:00:00Z' });
    const stale = row({
      quantity: 3000,
      recordedCorporationId: 1,
      cachedAt: '2026-07-12T11:00:00Z',
    });
    const { rows, changed } = mergeObservedRows([existing], [stale]);
    expect(rows).toEqual([existing]);
    expect(changed).toEqual([]);
  });

  it('reports an unchanged row as unchanged', () => {
    const same = row({ cachedAt: '2026-07-12T12:00:00Z' });
    const { changed } = mergeObservedRows([row()], [same]);
    expect(changed).toEqual([]);
  });

  it('keeps rows the fresh read no longer lists — ESI retention is not ours', () => {
    const old = row({ date: '2026-04-01' });
    const { rows } = mergeObservedRows([old], [row()]);
    expect(rows).toHaveLength(2);
  });
});

describe('groupObservedEntries', () => {
  it('takes the recorded corporation from the freshest row when a character changed corp mid-day', () => {
    const [entry] = groupObservedEntries([
      row({ typeId: ORE_A }),
      row({ typeId: ORE_B, recordedCorporationId: 1, cachedAt: '2026-07-12T13:00:00Z' }),
    ]);
    expect(entry.recordedCorporationId).toBe(1);
  });

  it('sums one character at one refinery on one day into an Observed Mining Entry, per ore type', () => {
    const entries = groupObservedEntries([
      row({ typeId: ORE_B, quantity: 50 }),
      row({ typeId: ORE_A, quantity: 100 }),
      row({ structureId: TATARA, quantity: 7 }),
      row({ date: '2026-07-11', quantity: 9 }),
    ]);
    expect(entries).toEqual([
      {
        characterId: 90000001,
        recordedCorporationId: 98000001,
        structureId: ATHANOR,
        date: '2026-07-11',
        oreLines: [{ typeId: ORE_A, quantity: 9 }],
      },
      {
        characterId: 90000001,
        recordedCorporationId: 98000001,
        structureId: ATHANOR,
        date: '2026-07-12',
        oreLines: [
          { typeId: ORE_A, quantity: 100 },
          { typeId: ORE_B, quantity: 50 },
        ],
      },
      {
        characterId: 90000001,
        recordedCorporationId: 98000001,
        structureId: TATARA,
        date: '2026-07-12',
        oreLines: [{ typeId: ORE_A, quantity: 7 }],
      },
    ]);
  });
});
