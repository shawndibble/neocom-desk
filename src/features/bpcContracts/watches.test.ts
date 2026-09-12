import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  createWatch,
  deleteWatch,
  listWatches,
  renameWatch,
  saveWatchState,
  updateWatchFilter,
  watchToFilter,
  type BpcWatchFilterInput,
} from './watches';

const EMPTY_FILTER: BpcWatchFilterInput = {
  typeIds: null,
  regionId: null,
  minMe: null,
  minTe: null,
  minRuns: null,
  maxPrice: null,
  spaceKinds: null,
};

beforeEach(async () => {
  await db.bpcSearchWatches.clear();
});

describe('createWatch', () => {
  it('writes a watch with an empty diff baseline', async () => {
    const watch = await createWatch('Rifter BPCs', {
      ...EMPTY_FILTER,
      typeIds: [587],
      maxPrice: 5_000_000,
    });

    expect(watch).toMatchObject({
      name: 'Rifter BPCs',
      typeIds: [587],
      maxPrice: 5_000_000,
      seenContractIds: [],
      minPriceSeen: null,
    });
    expect(await db.bpcSearchWatches.get(watch.id)).toEqual(watch);
  });

  it('is listed alongside every other watch', async () => {
    await createWatch('A', EMPTY_FILTER);
    await createWatch('B', EMPTY_FILTER);
    expect((await listWatches()).map((w) => w.name).sort()).toEqual(['A', 'B']);
  });
});

describe('watchToFilter', () => {
  it('converts stored arrays back into the engine filter’s Sets', async () => {
    const watch = await createWatch('Search', {
      ...EMPTY_FILTER,
      typeIds: [1, 2, 3],
      spaceKinds: ['highsec', 'lowsec'],
      regionId: 10000002,
    });

    const filter = watchToFilter(watch);
    expect(filter.typeIds).toEqual(new Set([1, 2, 3]));
    expect(filter.spaceKinds).toEqual(new Set(['highsec', 'lowsec']));
    expect(filter.regionId).toBe(10000002);
  });

  it('leaves an absent typeIds/spaceKinds as null, meaning "no restriction"', async () => {
    const watch = await createWatch('Search', EMPTY_FILTER);
    const filter = watchToFilter(watch);
    expect(filter.typeIds).toBeNull();
    expect(filter.spaceKinds).toBeNull();
  });
});

describe('renameWatch', () => {
  it('renames without touching the search or the diff baseline', async () => {
    const watch = await createWatch('Old name', { ...EMPTY_FILTER, maxPrice: 1_000 });
    await saveWatchState(watch.id, { seenContractIds: [7], minPriceSeen: 900 });

    const renamed = await renameWatch(
      { ...watch, seenContractIds: [7], minPriceSeen: 900 },
      'New name'
    );

    expect(renamed.name).toBe('New name');
    expect(renamed.maxPrice).toBe(1_000);
    expect((await db.bpcSearchWatches.get(watch.id))?.seenContractIds).toEqual([7]);
  });
});

describe('updateWatchFilter', () => {
  it('re-arms the watch: a changed filter clears the diff baseline', async () => {
    const watch = await createWatch('Search', { ...EMPTY_FILTER, maxPrice: 1_000 });
    await saveWatchState(watch.id, { seenContractIds: [7], minPriceSeen: 900 });
    const stale = { ...watch, seenContractIds: [7], minPriceSeen: 900 };

    const updated = await updateWatchFilter(stale, { ...EMPTY_FILTER, maxPrice: 500 });

    expect(updated.maxPrice).toBe(500);
    expect(updated.seenContractIds).toEqual([]);
    expect(updated.minPriceSeen).toBeNull();
    expect(await db.bpcSearchWatches.get(watch.id)).toMatchObject({
      maxPrice: 500,
      seenContractIds: [],
      minPriceSeen: null,
    });
  });
});

describe('deleteWatch', () => {
  it('removes the watch', async () => {
    const watch = await createWatch('Gone soon', EMPTY_FILTER);
    await deleteWatch(watch.id);
    expect(await db.bpcSearchWatches.get(watch.id)).toBeUndefined();
  });
});

describe('saveWatchState', () => {
  it('persists the diff baseline for the poller to read back next poll', async () => {
    const watch = await createWatch('Search', EMPTY_FILTER);
    await saveWatchState(watch.id, { seenContractIds: [1, 2], minPriceSeen: 4_000_000 });
    expect(await db.bpcSearchWatches.get(watch.id)).toMatchObject({
      seenContractIds: [1, 2],
      minPriceSeen: 4_000_000,
    });
  });
});
