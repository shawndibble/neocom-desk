import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPopView } from '@/sync/sharedPops';
import { HOUR_MS, MINUTE_MS } from '@/lib/age';

const fetchSharedPops = vi.fn<() => Promise<SharedPopView[]>>();
vi.mock('@/sync/sharedPops', () => ({ fetchSharedPops: () => fetchSharedPops() }));

const { loadSharedPopsCached, SHARED_POPS_CACHE_MS } = await import('./sharedPopsCache');

const POP = { id: 'p1' } as SharedPopView;

describe('loadSharedPopsCached', () => {
  beforeEach(() => {
    fetchSharedPops.mockReset();
  });

  it('serves one read to every caller inside the window, and a shorter window when asked', async () => {
    fetchSharedPops.mockResolvedValue([POP]);
    expect(await loadSharedPopsCached(0)).toEqual([POP]);
    expect(await loadSharedPopsCached(SHARED_POPS_CACHE_MS - 1)).toEqual([POP]);
    expect(fetchSharedPops).toHaveBeenCalledTimes(1);
    await loadSharedPopsCached(6 * MINUTE_MS, 5 * MINUTE_MS);
    expect(fetchSharedPops).toHaveBeenCalledTimes(2);
  });

  it('backs off to hourly after two empty reads in a row, and back once a pop shows', async () => {
    fetchSharedPops.mockResolvedValue([]);
    let now = 0;
    await loadSharedPopsCached(now);
    now += SHARED_POPS_CACHE_MS;
    await loadSharedPopsCached(now);
    expect(fetchSharedPops).toHaveBeenCalledTimes(2);
    now += SHARED_POPS_CACHE_MS;
    await loadSharedPopsCached(now);
    expect(fetchSharedPops).toHaveBeenCalledTimes(2);
    now += HOUR_MS - SHARED_POPS_CACHE_MS;
    fetchSharedPops.mockResolvedValue([POP]);
    expect(await loadSharedPopsCached(now - 1, 5 * MINUTE_MS)).toEqual([POP]);
    fetchSharedPops.mockResolvedValue([]);
    await loadSharedPopsCached(now - 1 + SHARED_POPS_CACHE_MS);
    expect(fetchSharedPops).toHaveBeenCalledTimes(4);
  });

  it('keeps no failed read', async () => {
    fetchSharedPops.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([POP]);
    await expect(loadSharedPopsCached(0)).rejects.toThrow('offline');
    expect(await loadSharedPopsCached(1)).toEqual([POP]);
  });
});
