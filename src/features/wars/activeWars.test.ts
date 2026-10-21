import { describe, expect, it } from 'vitest';
import { ACTIVE_WARS_STALE_AFTER_MS, freshActiveWars } from './activeWars';

const NOW = Date.UTC(2026, 9, 21, 12);
const war = {
  id: 1,
  declared: NOW - 1000,
  mutual: false,
  openForAllies: false,
  aggressor: { corporationId: 1, iskDestroyed: 0, shipsKilled: 0 },
  defender: { corporationId: 2, iskDestroyed: 0, shipsKilled: 0 },
  allies: [],
};

describe('freshActiveWars', () => {
  it('returns the wars of a recent list', () => {
    expect(freshActiveWars({ updatedAt: NOW - 1000, wars: [war] }, NOW)).toEqual([war]);
  });

  it('hides a list the sweep has stopped refreshing', () => {
    const doc = { updatedAt: NOW - ACTIVE_WARS_STALE_AFTER_MS - 1, wars: [war] };
    expect(freshActiveWars(doc, NOW)).toEqual([]);
  });

  it('is empty for a missing or malformed doc', () => {
    expect(freshActiveWars(undefined, NOW)).toEqual([]);
    expect(freshActiveWars({ wars: [war] }, NOW)).toEqual([]);
  });
});
