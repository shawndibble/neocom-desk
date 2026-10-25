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

  it('skips a bad entry without losing the rest', () => {
    expect(
      parseLpStoreVolume({
        lastSyncedAt: 1,
        perDay: { 34: 'many', 35: 0, tritanium: 5, 36: 2 },
      })
    ).toEqual({ 36: 2 });
  });

  it.each([
    ['not an object', 'nope'],
    ['no stamp', { perDay: {} }],
    ['a zero stamp', { lastSyncedAt: 0, perDay: {} }],
    ['no volume map', { lastSyncedAt: 1 }],
    ['a list for the map', { lastSyncedAt: 1, perDay: [] }],
  ])('rejects %s', (_label, raw) => {
    expect(parseLpStoreVolume(raw)).toBeNull();
  });
});
