import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { loadSavedHullFit, saveHullFit } from './hullFitCache';

const checks = new Map([
  [1, { fitsHull: true, canFly: true, fitsResources: false }],
  [2, { fitsHull: true, canFly: false, fitsResources: true }],
]);

beforeEach(async () => {
  await db.hullFitCache.clear();
});

describe('hull fit cache', () => {
  it('gives back what was saved, and null for a key never saved', async () => {
    await saveHullFit('a', checks);

    expect(await loadSavedHullFit('a')).toEqual(checks);
    expect(await loadSavedHullFit('b')).toBeNull();
  });

  it('keeps the newest 40 rows and drops the oldest', async () => {
    for (let i = 0; i < 42; i++) {
      await db.hullFitCache.put({ key: `k${i}`, savedAt: i, entries: [] });
    }

    await saveHullFit('newest', checks);

    expect(await db.hullFitCache.count()).toBe(40);
    expect(await db.hullFitCache.get('k0')).toBeUndefined();
    expect(await db.hullFitCache.get('k2')).toBeUndefined();
    expect(await db.hullFitCache.get('k3')).toBeDefined();
    expect(await db.hullFitCache.get('newest')).toBeDefined();
  });
});
