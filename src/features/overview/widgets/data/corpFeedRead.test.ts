import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveCorpReadAccess = vi.fn();
vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: (...a: unknown[]) => resolveCorpReadAccess(...a),
}));

import { CorpReadFailed } from '@/features/corp/corpRead';
import type { CorpFeedBase } from './corpFeeds';
import { readCorpFeed as read_, unlanded } from './corpFeedRead';

interface TestFeed extends CorpFeedBase {
  items: number[];
}
const readCorpFeed = read_<TestFeed>;

const at = (ms: number, fromCache = false) => ({ fetchedAt: new Date(ms), fromCache });
const landed = (ms: number, fromCache = false) => ({
  cached: { data: [], truncated: false, ...at(ms, fromCache) },
  needsReauth: false,
});
const failed = (needsReauth = false) => ({ cached: null, needsReauth });
const empty = { items: [] as number[] };

beforeEach(() => {
  vi.clearAllMocks();
  resolveCorpReadAccess.mockResolvedValue({ corporationId: 98, can: () => true });
});

describe('readCorpFeed', () => {
  it('is unreadable and reads nothing without corp access at all', async () => {
    resolveCorpReadAccess.mockResolvedValue(null);
    const read = vi.fn();
    const feed = await readCorpFeed(1, { capability: 'canReadOrders', empty, read });
    expect(feed).toEqual({
      readable: false,
      needsReauth: false,
      fetchedAt: null,
      fromCache: false,
      items: [],
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('is unreadable and reads nothing without the capability', async () => {
    resolveCorpReadAccess.mockResolvedValue({
      corporationId: 98,
      can: (c: string) => c !== 'canReadOrders',
    });
    const read = vi.fn();
    const feed = await readCorpFeed(1, { capability: 'canReadOrders', empty, read });
    expect(feed.readable).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it('hands the read the corporation and the capability check', async () => {
    const read = vi.fn(async (ctx) => ({
      reads: [landed(1)],
      body: { items: [ctx.can('canReadAssets') ? 1 : 0] },
    }));
    const feed = await readCorpFeed(7, { capability: 'canReadOrders', empty, read });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: 7, corporationId: 98 })
    );
    expect(feed.items).toEqual([1]);
  });

  it('stamps the oldest read and whether any came from the saved copy', async () => {
    const feed = await readCorpFeed(1, {
      capability: 'canReadOrders',
      empty,
      read: async () => ({
        reads: [landed(5000), landed(1000, true), null, failed()],
        body: { items: [1] },
      }),
    });
    expect(feed).toMatchObject({
      readable: true,
      needsReauth: false,
      fetchedAt: new Date(1000),
      fromCache: true,
      items: [1],
    });
  });

  it('stamps no age when no read landed', async () => {
    const feed = await readCorpFeed(1, {
      capability: 'canReadOrders',
      empty,
      read: async () => ({ reads: [], body: { items: [] } }),
    });
    expect(feed).toMatchObject({ readable: true, fetchedAt: null, fromCache: false });
  });

  it('takes an explicit age for reads that are not ESI results', async () => {
    const feed = await readCorpFeed(1, {
      capability: 'canReadOrders',
      empty,
      read: async () => ({ age: at(42, true), body: { items: [] } }),
    });
    expect(feed).toMatchObject({ fetchedAt: new Date(42), fromCache: true });
  });

  it('is unreadable with the empty body when the read declines', async () => {
    const feed = await readCorpFeed(1, {
      capability: 'canReadOrders',
      empty,
      read: async () => ({ unreadable: true }),
    });
    expect(feed).toMatchObject({ readable: false, needsReauth: false, items: [] });
  });

  it('asks for a grant when a read says the grant lapsed', async () => {
    const feed = await readCorpFeed(1, {
      capability: 'canReadOrders',
      empty,
      read: async () => unlanded('orders', failed(true)),
    });
    expect(feed).toMatchObject({ readable: false, needsReauth: true, items: [] });
  });

  it('throws CorpReadFailed when the read was allowed and failed', async () => {
    await expect(
      readCorpFeed(1, {
        capability: 'canReadOrders',
        empty,
        read: async () => unlanded('orders', failed(false), null),
      })
    ).rejects.toThrow(CorpReadFailed);
  });

  it('lets any other throw through untouched', async () => {
    await expect(
      readCorpFeed(1, {
        capability: 'canReadOrders',
        empty,
        read: async () => {
          throw new Error('boom');
        },
      })
    ).rejects.toThrow('boom');
  });
});

describe('unlanded', () => {
  it('prefers reauth when any of the reads says so', () => {
    expect(unlanded('x', failed(false), failed(true))).toEqual({ needsReauth: true });
  });
});
