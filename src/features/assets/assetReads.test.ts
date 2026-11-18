import { describe, expect, it, vi } from 'vitest';
import { NO_ASSET_NAMES } from '@/engine/assetNames';
import { anyFromCache, oldestFetchedAt, startAssetReads } from './assetReads';

const mocks = vi.hoisted(() => ({
  loadTypeVolumes: vi.fn(async () => new Map([[34, 0.01]])),
  loadAssetCopyValues: vi.fn(async () => new Map([[7, 500]])),
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeVolumes: mocks.loadTypeVolumes }));
vi.mock('@/features/assets/assetCopyValues', () => ({
  loadAssetCopyValues: mocks.loadAssetCopyValues,
}));

describe('startAssetReads', () => {
  it('starts volumes, copy values and names together', async () => {
    const loadBlueprints = vi.fn();
    const names = { 1: 'Ship' };
    const reads = startAssetReads({
      characterId: 9,
      assets: [{ item_id: 7, type_id: 34 }],
      typeIds: [34],
      loadBlueprints,
      loadAssetNames: async () => names,
      cancelled: false,
    });
    expect(await reads.volumeByTypeId).toEqual(new Map([[34, 0.01]]));
    expect(await reads.copyValueByItemId).toEqual(new Map([[7, 500]]));
    expect(await reads.assetNames).toBe(names);
    expect(mocks.loadTypeVolumes).toHaveBeenCalledWith([34]);
    expect(mocks.loadAssetCopyValues).toHaveBeenCalledWith(
      9,
      [{ item_id: 7, type_id: 34 }],
      loadBlueprints
    );
  });

  it('starts nothing when superseded', async () => {
    mocks.loadTypeVolumes.mockClear();
    mocks.loadAssetCopyValues.mockClear();
    const loadAssetNames = vi.fn();
    const reads = startAssetReads({
      characterId: 9,
      assets: [],
      typeIds: [],
      loadBlueprints: vi.fn(),
      loadAssetNames,
      cancelled: true,
    });
    expect((await reads.volumeByTypeId).size).toBe(0);
    expect((await reads.copyValueByItemId).size).toBe(0);
    expect(await reads.assetNames).toBe(NO_ASSET_NAMES);
    expect(mocks.loadTypeVolumes).not.toHaveBeenCalled();
    expect(mocks.loadAssetCopyValues).not.toHaveBeenCalled();
    expect(loadAssetNames).not.toHaveBeenCalled();
  });
});

describe('oldestFetchedAt / anyFromCache', () => {
  const read = (iso: string, fromCache = false) => ({
    cached: { fetchedAt: new Date(iso), fromCache },
  });

  it('folds to the oldest date, ignoring failed reads', () => {
    expect(
      oldestFetchedAt([read('2026-01-02'), { cached: null }, read('2026-01-01')])?.toISOString()
    ).toBe(new Date('2026-01-01').toISOString());
  });

  it('is null when no read carries a date', () => {
    expect(oldestFetchedAt([{ cached: null }, {}])).toBeNull();
    expect(oldestFetchedAt([])).toBeNull();
  });

  it('reports a cache fallback from any read', () => {
    expect(anyFromCache([read('2026-01-01'), read('2026-01-01', true)])).toBe(true);
    expect(anyFromCache([read('2026-01-01'), { cached: null }])).toBe(false);
  });
});
