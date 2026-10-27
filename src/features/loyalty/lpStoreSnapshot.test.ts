import { describe, expect, it } from 'vitest';
import { parseLpStoreSnapshot } from './lpStoreSnapshot';

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
