import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type { CorporationAsset } from '@/esi/endpoints';
import { loadCorpAssetsSnapshot } from './corpAssetsSnapshot';

const mocks = vi.hoisted(() => ({
  loadCorporationId: vi.fn(),
  loadCorporationStructures: vi.fn(),
  loadCorporationAssets: vi.fn(),
  loadCorpAssetLabels: vi.fn(),
  loadCorporationDivisions: vi.fn(),
  loadCorporationBlueprints: vi.fn(),
  loadAssetCopyValues: vi.fn(),
  loadCorporationAssetNames: vi.fn(),
  loadTypeVolumes: vi.fn(),
  loadTypeCategories: vi.fn(),
  getAveragePriceByType: vi.fn(),
  accountCorpReaders: vi.fn(),
}));
vi.mock('@/features/corp/corpReadAccess', () => ({
  accountCorpReaders: mocks.accountCorpReaders,
}));
vi.mock('@/features/corp/boardData', () => ({
  loadCorporationId: mocks.loadCorporationId,
  loadCorporationStructures: mocks.loadCorporationStructures,
}));
vi.mock('@/features/corp/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/assets')>()),
  loadCorporationAssets: mocks.loadCorporationAssets,
  loadCorpAssetLabels: mocks.loadCorpAssetLabels,
}));
vi.mock('@/features/corp/wallet', () => ({
  loadCorporationDivisions: mocks.loadCorporationDivisions,
}));
vi.mock('@/features/corp/blueprints', () => ({
  loadCorporationBlueprints: mocks.loadCorporationBlueprints,
}));
vi.mock('@/features/assets/assetCopyValues', () => ({
  loadAssetCopyValues: mocks.loadAssetCopyValues,
}));
vi.mock('@/features/assets/assetNames', () => ({
  loadCorporationAssetNames: mocks.loadCorporationAssetNames,
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeVolumes: mocks.loadTypeVolumes }));
vi.mock('@/features/corp/assetCategories', () => ({
  loadTypeCategories: mocks.loadTypeCategories,
}));
vi.mock('@/market/prices', () => ({ getAveragePriceByType: mocks.getAveragePriceByType }));

const OLD = new Date('2026-09-03T10:00:00Z');
const NEW = new Date('2026-09-03T11:00:00Z');

function ok<T>(data: T, fetchedAt: Date, fromCache = false): StatusResult<T> {
  const cached: CachedResult<T> = { data, fetchedAt, fromCache, truncated: false };
  return { cached, needsReauth: false };
}

const ASSETS: CorporationAsset[] = [
  {
    item_id: 1,
    type_id: 34,
    quantity: 5,
    location_id: 60003760,
    location_type: 'other',
    location_flag: 'CorpSAG1',
    is_singleton: false,
  },
  {
    item_id: 2,
    type_id: 35,
    quantity: 1,
    location_id: 60003760,
    location_type: 'other',
    location_flag: 'CorpSAG2',
    is_singleton: false,
  },
];

const signal = (cancelled = false) => ({ cancelled });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadCorporationId.mockResolvedValue(98000001);
  mocks.loadCorporationAssets.mockResolvedValue(ok(ASSETS, NEW));
  mocks.loadCorporationDivisions.mockResolvedValue(
    ok({ hangar: [{ division: 1, name: 'Main' }], wallet: [] }, OLD, true)
  );
  mocks.getAveragePriceByType.mockResolvedValue(new Map([[34, 5]]));
  mocks.loadCorporationStructures.mockResolvedValue(ok([], NEW));
  mocks.accountCorpReaders.mockResolvedValue(new Map());
  mocks.loadCorpAssetLabels.mockResolvedValue({
    types: new Map([[34, 'Trit']]),
    locations: new Map(),
  });
  mocks.loadTypeVolumes.mockResolvedValue(new Map([[34, 0.01]]));
  mocks.loadTypeCategories.mockResolvedValue(new Map());
  mocks.loadAssetCopyValues.mockResolvedValue(new Map([[9, 100]]));
  mocks.loadCorporationAssetNames.mockResolvedValue({ 1: 'Hangar' });
});

describe('loadCorpAssetsSnapshot', () => {
  it('returns an empty snapshot when the character has no corporation', async () => {
    mocks.loadCorporationId.mockResolvedValue(null);
    const snap = await loadCorpAssetsSnapshot(42, signal(), true);
    expect(snap.corporationId).toBeNull();
    expect(snap.inputs).toBeNull();
    expect(mocks.loadCorporationAssets).not.toHaveBeenCalled();
  });

  it('skips the label fan-out when superseded after the first reads', async () => {
    const live = { cancelled: false };
    mocks.loadCorporationAssets.mockImplementation(async () => {
      live.cancelled = true;
      return ok(ASSETS, NEW);
    });
    const snap = await loadCorpAssetsSnapshot(42, live, true);
    expect(snap.inputs).toBeNull();
    expect(mocks.loadCorpAssetLabels).not.toHaveBeenCalled();
    expect(mocks.loadTypeVolumes).not.toHaveBeenCalled();
  });

  it('assembles rows, reads, division names and the oldest fetchedAt', async () => {
    const snap = await loadCorpAssetsSnapshot(42, signal(), true);
    expect(snap.corporationId).toBe(98000001);
    expect(snap.inputs?.map((i) => i.itemId)).toEqual([1, 2]);
    expect(snap.placeIds).toEqual([60003760]);
    expect(snap.assetsShown).toBe(2);
    expect(snap.truncated).toBe(false);
    expect(snap.divisionNames.get(1)).toBe('Main');
    expect(snap.priceByTypeId.get(34)).toBe(5);
    expect(snap.volumeByTypeId.get(34)).toBe(0.01);
    expect(snap.copyValueByItemId.get(9)).toBe(100);
    expect(snap.assetNames[1]).toBe('Hangar');
    expect(snap.fetchedAt).toEqual(OLD);
    expect(snap.fromCache).toBe(true);
    expect(mocks.loadTypeVolumes).toHaveBeenCalledWith([34, 35]);
    expect(mocks.loadTypeCategories).toHaveBeenCalledWith([34, 35]);
  });

  it('reads structure names through whichever Character can read them', async () => {
    mocks.accountCorpReaders.mockResolvedValue(new Map([[98000001, 77]]));
    mocks.loadCorporationStructures.mockResolvedValue(ok([], NEW));
    await loadCorpAssetsSnapshot(42, signal(), true);
    expect(mocks.loadCorporationStructures).toHaveBeenCalledWith(77, 98000001);
  });

  it('does not read blueprints or structures without the roles', async () => {
    mocks.loadAssetCopyValues.mockImplementation(async (_c, _a, loadBlueprints) => {
      expect(await loadBlueprints()).toBeNull();
      return new Map();
    });
    await loadCorpAssetsSnapshot(42, signal(), false);
    expect(mocks.loadCorporationBlueprints).not.toHaveBeenCalled();
    expect(mocks.loadCorporationStructures).not.toHaveBeenCalled();
  });

  it('reads blueprints with the role', async () => {
    const blueprints = [{ item_id: 9, material_efficiency: 10, time_efficiency: 20, runs: 1 }];
    mocks.loadCorporationBlueprints.mockResolvedValue(ok(blueprints, NEW));
    mocks.loadAssetCopyValues.mockImplementation(async (_c, _a, loadBlueprints) => {
      expect(await loadBlueprints()).toBe(blueprints);
      return new Map();
    });
    await loadCorpAssetsSnapshot(42, signal(), true);
    expect(mocks.loadCorporationBlueprints).toHaveBeenCalledWith(42, 98000001);
  });

  it('keeps null inputs and skips names/labels when the assets read failed', async () => {
    mocks.loadCorporationAssets.mockResolvedValue({ cached: null, needsReauth: false });
    mocks.loadCorporationDivisions.mockResolvedValue({ cached: null, needsReauth: false });
    const snap = await loadCorpAssetsSnapshot(42, signal(), true);
    expect(snap.inputs).toBeNull();
    expect(snap.assetsShown).toBe(0);
    expect(snap.fetchedAt).toBeNull();
    expect(snap.fromCache).toBe(false);
    expect(mocks.loadCorpAssetLabels).not.toHaveBeenCalled();
    expect(mocks.loadCorporationAssetNames).not.toHaveBeenCalled();
  });
});
