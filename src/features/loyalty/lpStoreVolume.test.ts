import { describe, expect, it } from 'vitest';
import { parseLpStoreVolume } from './lpStoreVolume';

describe('parseLpStoreVolume', () => {
  it('accepts the object the writer produces', () => {
    expect(
      parseLpStoreVolume({ lastSyncedAt: 100, days: 30, perDay: { 34: 1500, 35: 0.03 } })
    ).toEqual({
      34: 1500,
      35: 0.03,
    });
  });

  it('accepts a region where nothing traded', () => {
    expect(parseLpStoreVolume({ lastSyncedAt: 100, days: 30, perDay: {} })).toEqual({});
  });

  it.each([
    ['not an object', 'nope'],
    ['no stamp', { perDay: {} }],
    ['a zero stamp', { lastSyncedAt: 0, perDay: {} }],
    ['no volume map', { lastSyncedAt: 1 }],
    ['a list for the map', { lastSyncedAt: 1, perDay: [] }],
    ['a non-numeric volume', { lastSyncedAt: 1, perDay: { 34: 'many' } }],
    ['a zero volume', { lastSyncedAt: 1, perDay: { 34: 0 } }],
    ['a non-numeric type id', { lastSyncedAt: 1, perDay: { tritanium: 5 } }],
  ])('rejects %s', (_label, raw) => {
    expect(parseLpStoreVolume(raw)).toBeNull();
  });
});
