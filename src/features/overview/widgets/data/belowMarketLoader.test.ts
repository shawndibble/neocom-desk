import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useBelowMarketSummary } from '@/features/contractSearch/belowMarketSummary';
import { loadBelowMarketWidget } from './kindLoaders';

vi.mock('@/features/route/currentSystem', () => ({
  loadCurrentSystemId: vi.fn(async () => 30000142),
}));
vi.mock('@/features/route/jumpBasis', () => ({
  loadJumpBasis: vi.fn(async () => ({ rules: {}, network: {} })),
}));
vi.mock('@/features/route/localRoute', () => ({
  localJumpDistances: vi.fn(async () => ({ kind: 'known', jumps: new Map([[30002187, 9]]) })),
}));

describe('loadBelowMarketWidget', () => {
  beforeEach(async () => {
    await db.settings.clear();
    useBelowMarketSummary.setState({ value: null, hydrated: false });
  });

  it('has no view before Item search has valued the snapshot, and makes no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await loadBelowMarketWidget(91)).toEqual({
      hasView: false,
      count: 0,
      contracts: [],
      fetchedAt: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('reads the stored summary with its age and jumps from the Current System', async () => {
    await db.settings.put({
      key: 'belowMarketLastView',
      value: {
        fetchedAt: 1_000,
        count: 7,
        contracts: [
          { contractId: 1, item: 'Rifter', more: 12, profit: 42_000_000, systemId: 30002187 },
          { contractId: 2, item: 'Tengu', more: 0, profit: 18_000_000, systemId: null },
          { contractId: 3, item: 'Hulk', more: 4, profit: 11_000_000, systemId: 30000001 },
        ],
      },
    });
    const data = await loadBelowMarketWidget(91);
    expect(data).toEqual({
      hasView: true,
      count: 7,
      contracts: [
        { contractId: 1, item: 'Rifter', more: 12, profit: 42_000_000, jumps: 9 },
        { contractId: 2, item: 'Tengu', more: 0, profit: 18_000_000, jumps: null },
        { contractId: 3, item: 'Hulk', more: 4, profit: 11_000_000, jumps: null },
      ],
      fetchedAt: new Date(1_000),
    });
  });
});
