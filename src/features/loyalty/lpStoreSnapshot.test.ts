import { describe, expect, it } from 'vitest';
import { nearestStation, parseLpStoreSnapshot } from './lpStoreSnapshot';

const ROW = { corporationId: 1000001, systemIds: [30000142], offers: [[1, 2, 3, 4, 5, []]] };

describe('parseLpStoreSnapshot', () => {
  it('accepts the object the writer produces', () => {
    expect(parseLpStoreSnapshot({ lastSyncedAt: 100, rows: [ROW] })).toEqual({
      lastSyncedAt: 100,
      rows: [ROW],
    });
  });

  it.each([
    ['not an object', 'nope'],
    ['no stamp', { rows: [ROW] }],
    ['a zero stamp', { lastSyncedAt: 0, rows: [ROW] }],
    ['rows that are not a list', { lastSyncedAt: 1, rows: {} }],
    ['a row without offers', { lastSyncedAt: 1, rows: [{ corporationId: 1, systemIds: [] }] }],
    ['a row without a corporation', { lastSyncedAt: 1, rows: [{ systemIds: [], offers: [] }] }],
  ])('rejects %s', (_label, raw) => {
    expect(parseLpStoreSnapshot(raw)).toBeNull();
  });
});

// Jumps from the Current System; 30000004 is unreachable (absent).
const JUMPS = new Map<number, number>([
  [30000001, 0],
  [30000002, 3],
  [30000003, 7],
]);

describe('nearestStation', () => {
  it('picks the station system with the fewest jumps', () => {
    expect(nearestStation([30000003, 30000002], JUMPS)).toEqual({ systemId: 30000002, jumps: 3 });
  });

  it('skips unreachable systems and gives null when none is reachable', () => {
    expect(nearestStation([30000004, 30000003], JUMPS)).toEqual({ systemId: 30000003, jumps: 7 });
    expect(nearestStation([30000004], JUMPS)).toBeNull();
  });

  it('gives null without a distance map (no Current System yet)', () => {
    expect(nearestStation([30000001], null)).toBeNull();
  });
});
