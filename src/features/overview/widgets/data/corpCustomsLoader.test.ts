import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveCorpReadAccess = vi.fn();
const loadCorporationCustomsOffices = vi.fn();
vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: (...a: unknown[]) => resolveCorpReadAccess(...a),
}));
vi.mock('@/features/corp/customsOffices', () => ({
  loadCorporationCustomsOffices: (...a: unknown[]) => loadCorporationCustomsOffices(...a),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () => new Map([[2233, 'Customs Office']]),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () => new Map([[30002813, { name: 'Tama' }]]),
}));

import { loadCorpCustoms } from './corpFeedLoaders';

const access = (can: boolean) => ({ corporationId: 98000001, can: () => can });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadCorpCustoms', () => {
  it('names the office types and systems', async () => {
    resolveCorpReadAccess.mockResolvedValue(access(true));
    loadCorporationCustomsOffices.mockResolvedValue({
      cached: {
        data: [{ office_id: 1, system_id: 30002813, type_id: 2233 }],
        fetchedAt: new Date(0),
        fromCache: false,
      },
      needsReauth: false,
    });
    const feed = await loadCorpCustoms(1);
    expect(loadCorporationCustomsOffices).toHaveBeenCalledWith(1, 98000001);
    expect(feed.readable).toBe(true);
    expect(feed.typeNames.get(2233)).toBe('Customs Office');
    expect(feed.systemNames.get(30002813)).toBe('Tama');
  });
});
