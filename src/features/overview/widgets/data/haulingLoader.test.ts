import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useHaulingSummary } from '@/features/market/haulingSummary';
import { loadHaulingWidget } from './kindLoaders';

vi.mock('@/features/route/localRoute', () => ({
  findLocalJumps: vi.fn(async (_from: number, to: number) =>
    to === 30002187 ? { kind: 'known', jumps: 12 } : { kind: 'unknown' }
  ),
}));

describe('loadHaulingWidget', () => {
  beforeEach(async () => {
    await db.settings.clear();
    useHaulingSummary.setState({ value: null, hydrated: false });
  });

  it('has no scan before the Hauling tab has run one, and makes no market call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await loadHaulingWidget()).toEqual({ hasScan: false, routes: [], fetchedAt: null });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('reads the stored summary with its age and the jumps between each lane', async () => {
    await db.settings.put({
      key: 'haulingLastScan',
      value: {
        fetchedAt: 1_000,
        lanes: [
          { fromHub: 'jita', toHub: 'amarr', item: 'Tritanium', profit: 48_000_000 },
          { fromHub: 'jita', toHub: 'dodixie', item: 'Pyerite', profit: 30_000_000 },
          { fromHub: 'jita', toHub: 'nowhere', item: 'Gone', profit: 1 },
        ],
      },
    });
    const data = await loadHaulingWidget();
    expect(data.hasScan).toBe(true);
    expect(data.fetchedAt).toEqual(new Date(1_000));
    expect(data.routes).toEqual([
      { from: 'Jita', to: 'Amarr', item: 'Tritanium', profit: 48_000_000, jumps: 12 },
      { from: 'Jita', to: 'Dodixie', item: 'Pyerite', profit: 30_000_000, jumps: null },
    ]);
  });
});
