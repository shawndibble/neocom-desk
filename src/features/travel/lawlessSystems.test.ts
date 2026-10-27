import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAWLESS_STALE_AFTER_MS } from '@/engine/route/lawless';
import { LAWLESS_R2_URL, loadLawlessSystems, resetLawlessSystemsCache } from './lawlessSystems';

describe('loadLawlessSystems', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetLawlessSystemsCache();
  });

  it('reads the list from R2', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ systemIds: [1, 2], updatedAt: Date.now() })
    );
    vi.stubGlobal('fetch', fetchMock);
    expect([...(await loadLawlessSystems())]).toEqual([1, 2]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(LAWLESS_R2_URL);
  });

  it('trusts a fresh empty list', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ systemIds: [], updatedAt: Date.now() }));
    expect((await loadLawlessSystems()).size).toBe(0);
  });

  it.each([
    ['a 404', () => new Response('', { status: 404 })],
    ['a 500', () => new Response('', { status: 500 })],
    [
      'a stale copy',
      () => Response.json({ systemIds: [1], updatedAt: Date.now() - LAWLESS_STALE_AFTER_MS - 1 }),
    ],
  ])('is empty on %s', async (_name, respond) => {
    vi.stubGlobal('fetch', async () => respond());
    expect((await loadLawlessSystems()).size).toBe(0);
  });

  it('is empty when the fetch throws', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    expect((await loadLawlessSystems()).size).toBe(0);
  });

  it('remembers a miss, so a remount does not refetch R2 at once', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await loadLawlessSystems();
    await loadLawlessSystems();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
