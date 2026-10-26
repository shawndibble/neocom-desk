import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOK_CACHE_MAX_AGE_MS,
  bookVersionsOf,
  cachedPart,
  clearBookCache,
  type BookVersions,
  type Copy,
  type PartStore,
} from './bookCache';

const KEY = '7:98000001';
const T0 = 1_760_000_000_000;
const v = (collections: Record<string, string>): BookVersions => ({ book: 'b1', collections });

beforeEach(() => clearBookCache());

describe('bookVersionsOf', () => {
  it('reads the marker off the book document', () => {
    expect(
      bookVersionsOf({ bookVersion: 'b1', collectionVersions: { miners: 'm1', junk: 3 } })
    ).toEqual({ book: 'b1', collections: { miners: 'm1' } });
  });

  it('is null on a book the server has never stamped', () => {
    // A client can ship ahead of the functions deploy: nothing is trusted then.
    expect(bookVersionsOf({ active: true })).toBeNull();
    expect(bookVersionsOf(undefined)).toBeNull();
  });
});

describe('cachedPart', () => {
  it('reads once and serves the copy while the collection stamp is unchanged', async () => {
    const read = vi.fn(async () => [{ id: 'm1' }]);
    const versions = v({ miners: 'm1' });
    expect(await cachedPart(KEY, 'miners', versions, read, { now: T0 })).toEqual([{ id: 'm1' }]);
    expect(await cachedPart(KEY, 'miners', versions, read, { now: T0 + 1000 })).toEqual([
      { id: 'm1' },
    ]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('re-reads once the collection stamp moved, and only that collection', async () => {
    const miners = vi.fn(async () => ['m']);
    const statements = vi.fn(async () => ['s']);
    await cachedPart(KEY, 'miners', v({ miners: 'm1', statements: 's1' }), miners, { now: T0 });
    await cachedPart(KEY, 'statements', v({ miners: 'm1', statements: 's1' }), statements, {
      now: T0,
    });

    const after = v({ miners: 'm2', statements: 's1' });
    await cachedPart(KEY, 'miners', after, miners, { now: T0 + 1 });
    await cachedPart(KEY, 'statements', after, statements, { now: T0 + 1 });

    expect(miners).toHaveBeenCalledTimes(2);
    expect(statements).toHaveBeenCalledTimes(1);
  });

  it('never trusts a missing stamp or an unstamped book', async () => {
    const read = vi.fn(async () => []);
    await cachedPart(KEY, 'miners', v({}), read, { now: T0 });
    await cachedPart(KEY, 'miners', v({}), read, { now: T0 });
    await cachedPart(KEY, 'miners', null, read, { now: T0 });
    await cachedPart(KEY, 'miners', null, read, { now: T0 });
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('re-reads a copy older than the max age, so a missed stamp is bounded', async () => {
    const read = vi.fn(async () => []);
    const versions = v({ miners: 'm1' });
    await cachedPart(KEY, 'miners', versions, read, { now: T0 });
    await cachedPart(KEY, 'miners', versions, read, { now: T0 + BOOK_CACHE_MAX_AGE_MS + 1 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps two shapes under one stamp apart by slot', async () => {
    const versions = v({ feeders: 'f1' });
    await cachedPart(KEY, 'feeders', versions, async () => ['raw'], { now: T0 });
    const rows = await cachedPart(KEY, 'feeders', versions, async () => ['rows'], {
      now: T0,
      slot: 'feeders:rows',
    });
    expect(rows).toEqual(['rows']);
  });

  it('keeps each Character and corporation apart', async () => {
    const read = vi.fn(async () => []);
    const versions = v({ miners: 'm1' });
    await cachedPart('7:1', 'miners', versions, read, { now: T0 });
    await cachedPart('8:1', 'miners', versions, read, { now: T0 });
    await cachedPart('7:2', 'miners', versions, read, { now: T0 });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('hands out a copy a caller cannot mutate the cache through', async () => {
    const versions = v({ miners: 'm1' });
    const first = await cachedPart(KEY, 'miners', versions, async () => [{ id: 'm1' }], {
      now: T0,
    });
    first.push({ id: 'oops' });
    const second = await cachedPart(KEY, 'miners', versions, async () => [], { now: T0 });
    expect(second).toEqual([{ id: 'm1' }]);
  });

  it('does not keep a failed read', async () => {
    const versions = v({ miners: 'm1' });
    await expect(
      cachedPart(KEY, 'miners', versions, () => Promise.reject(new Error('denied')), { now: T0 })
    ).rejects.toThrow('denied');
    const read = vi.fn(async () => ['m']);
    expect(await cachedPart(KEY, 'miners', versions, read, { now: T0 })).toEqual(['m']);
    expect(read).toHaveBeenCalledTimes(1);
  });

  describe('with a persistent store', () => {
    const memoryStore = (held: Record<string, Copy> = {}) => {
      const store: PartStore = {
        load: vi.fn(async (slot) => held[slot]),
        save: vi.fn(async (slot, copy) => void (held[slot] = copy)),
        forget: vi.fn(async (slot) => void delete held[slot]),
      };
      return { store, held };
    };
    const versions = v({ miners: 'm1' });

    it('serves a stored copy of a matching stamp with no read', async () => {
      const { store } = memoryStore({ miners: { version: 'm1', at: T0, data: ['kept'] } });
      const read = vi.fn(async () => ['fresh']);
      expect(await cachedPart(KEY, 'miners', versions, read, { now: T0 + 1, store })).toEqual([
        'kept',
      ]);
      expect(read).not.toHaveBeenCalled();
    });

    it('reads and stores when the stored stamp differs', async () => {
      const { store, held } = memoryStore({ miners: { version: 'm0', at: T0, data: ['old'] } });
      const got = await cachedPart(KEY, 'miners', versions, async () => ['new'], {
        now: T0 + 1,
        store,
      });
      expect(got).toEqual(['new']);
      expect(held.miners).toEqual({ version: 'm1', at: T0 + 1, data: ['new'] });
    });

    it('reads when the stored copy is over the max age', async () => {
      const { store } = memoryStore({ miners: { version: 'm1', at: T0, data: ['old'] } });
      const read = vi.fn(async () => ['new']);
      await cachedPart(KEY, 'miners', versions, read, {
        now: T0 + BOOK_CACHE_MAX_AGE_MS + 1,
        store,
      });
      expect(read).toHaveBeenCalledTimes(1);
    });

    it('never trusts a stored copy without a stamp, and drops it', async () => {
      const { store, held } = memoryStore({ miners: { version: 'm1', at: T0, data: ['old'] } });
      await cachedPart(KEY, 'miners', v({}), async () => ['new'], { now: T0, store });
      expect(store.load).not.toHaveBeenCalled();
      expect(held.miners).toBeUndefined();
    });

    it('does not trust a copy stamped in the future (clock set back)', async () => {
      const { store } = memoryStore({
        miners: { version: 'm1', at: T0 + 48 * 3600_000, data: ['old'] },
      });
      const read = vi.fn(async () => ['new']);
      await cachedPart(KEY, 'miners', versions, read, { now: T0, store });
      expect(read).toHaveBeenCalledTimes(1);
    });

    it('still reads when the store fails', async () => {
      const store: PartStore = {
        load: async () => Promise.reject(new Error('dexie')),
        save: async () => Promise.reject(new Error('dexie')),
        forget: async () => Promise.reject(new Error('dexie')),
      };
      expect(
        await cachedPart(KEY, 'miners', versions, async () => ['x'], { now: T0, store })
      ).toEqual(['x']);
    });
  });
});
