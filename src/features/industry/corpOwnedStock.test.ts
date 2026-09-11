import { describe, expect, it, vi } from 'vitest';

const loadCorporationAssets = vi.fn();
vi.mock('@/features/corp/assets', () => ({
  loadCorporationAssets: (characterId: number, corporationId: number) =>
    loadCorporationAssets(characterId, corporationId),
}));

const { loadCorpOwnedStockSource } = await import('./corpOwnedStock');

const ASSET = {
  item_id: 1,
  type_id: 34,
  quantity: 4000,
  location_id: 60003760,
  location_type: 'station' as const,
  location_flag: 'CorpSAG1',
  is_singleton: false,
};

describe('loadCorpOwnedStockSource', () => {
  it('turns the corp asset read into an owned-stock source tagged with the corporation', async () => {
    loadCorporationAssets.mockResolvedValue({ cached: { data: [ASSET], truncated: false } });

    const result = await loadCorpOwnedStockSource(91, 500);

    expect(result).toEqual({
      source: { characterId: 91, corporationId: 500, assets: [ASSET] },
      truncated: false,
    });
  });

  it('reports truncation from the cached read', async () => {
    loadCorporationAssets.mockResolvedValue({ cached: { data: [], truncated: true } });

    const result = await loadCorpOwnedStockSource(91, 500);

    expect(result?.truncated).toBe(true);
  });

  it('returns null when nothing could be read at all', async () => {
    loadCorporationAssets.mockResolvedValue({ cached: null, needsReauth: true });

    expect(await loadCorpOwnedStockSource(91, 500)).toBeNull();
  });
});
