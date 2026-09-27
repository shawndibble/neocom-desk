import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { PilotProfile } from '@/engine/fittings/types';
import type { FittingCatalogue } from './useFittingCatalogue';

const checkCandidates = vi.fn();
vi.mock('./dogmaFittingEngine', () => ({
  checkCandidates: (...args: unknown[]) => checkCandidates(...args),
}));

import { clearHullFitMemory, getHullFit } from './hullFitService';

const profile = (level: number): PilotProfile => ({
  skillLevels: new Map([[3300, level]]),
  implantTypeIds: [],
  boosterTypeIds: [],
});

const catalogue = {
  rackOf: { 1: 'low', 2: 'low' },
  marketTypes: [
    { typeId: 1, name: 'A', marketGroupId: 10 },
    { typeId: 2, name: 'B', marketGroupId: 10 },
  ],
} as unknown as FittingCatalogue;

beforeEach(async () => {
  checkCandidates.mockReset();
  checkCandidates.mockImplementation((_ship: number, _rack: string, ids: number[]) => {
    return new Map(
      ids.map((id) => [id, { fitsHull: id === 1, canFly: true, fitsResources: true }])
    );
  });
  clearHullFitMemory();
  await db.hullFitCache.clear();
});

describe('getHullFit', () => {
  it('runs one check for concurrent callers of the same hull and skills', async () => {
    const [a, b] = await Promise.all([
      getHullFit(catalogue, 587, profile(5)),
      getHullFit(catalogue, 587, profile(5)),
    ]);
    expect(a).toBe(b);
    expect(checkCandidates).toHaveBeenCalledTimes(1);
    expect(a.get(1)?.fitsHull).toBe(true);
    // What doesn't go on the hull is still listed, marked as such — the Hull filter needs it.
    expect(a.get(2)?.fitsHull).toBe(false);
  });

  it('answers a repeat from memory', async () => {
    await getHullFit(catalogue, 587, profile(5));
    checkCandidates.mockClear();
    await getHullFit(catalogue, 587, profile(5));
    expect(checkCandidates).not.toHaveBeenCalled();
  });

  it('answers from the saved row after memory is lost, as after a reload', async () => {
    await getHullFit(catalogue, 587, profile(5));
    await vi.waitFor(async () => expect(await db.hullFitCache.count()).toBe(1));
    clearHullFitMemory();
    checkCandidates.mockClear();

    const checks = await getHullFit(catalogue, 587, profile(5));

    expect(checkCandidates).not.toHaveBeenCalled();
    expect(checks.get(1)).toEqual({ fitsHull: true, canFly: true, fitsResources: true });
    expect(checks.get(2)).toEqual({ fitsHull: false, canFly: true, fitsResources: true });
  });

  it('checks again for other skills, or another hull', async () => {
    await getHullFit(catalogue, 587, profile(5));
    checkCandidates.mockClear();
    await getHullFit(catalogue, 587, profile(4));
    await getHullFit(catalogue, 588, profile(5));
    expect(checkCandidates).toHaveBeenCalledTimes(2);
  });
});
