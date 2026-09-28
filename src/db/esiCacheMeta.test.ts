import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { db } from './index';

/**
 * `esiCacheMeta` is a projection of `esiCache` — every row's freshness fields
 * without its (potentially megabytes-large) value — kept in step by a DBCore
 * middleware, so no write or delete path anywhere in the app (or in a test)
 * can leave the two disagreeing.
 */
beforeEach(async () => {
  await db.esiCache.clear();
  await db.esiCacheMeta.clear();
});

const row = (characterId: number, key: string, fetchedAt = 1000) => ({
  characterId,
  key,
  value: { big: 'payload' },
  fetchedAt,
});

describe('esiCacheMeta mirror', () => {
  it('a put writes the meta projection, without the value', async () => {
    await db.esiCache.put({ ...row(1, 'skills', 5), truncated: true, expiresAt: 9, etag: '"e1"' });
    expect(await db.esiCacheMeta.get([1, 'skills'])).toEqual({
      characterId: 1,
      key: 'skills',
      fetchedAt: 5,
      truncated: true,
      expiresAt: 9,
      etag: '"e1"',
    });
  });

  it('a re-put replaces the meta, dropping fields the new row no longer carries', async () => {
    await db.esiCache.put({ ...row(1, 'skills', 5), expiresAt: 9, etag: '"e1"' });
    await db.esiCache.put(row(1, 'skills', 7));
    expect(await db.esiCacheMeta.get([1, 'skills'])).toEqual({
      characterId: 1,
      key: 'skills',
      fetchedAt: 7,
    });
  });

  it('bulkPut mirrors every row', async () => {
    await db.esiCache.bulkPut([row(0, 'a'), row(0, 'b'), row(2, 'a')]);
    expect(await db.esiCacheMeta.count()).toBe(3);
  });

  it('add mirrors too', async () => {
    await db.esiCache.add(row(3, 'x'));
    expect(await db.esiCacheMeta.get([3, 'x'])).toBeDefined();
  });

  it('a key delete removes the meta', async () => {
    await db.esiCache.bulkPut([row(1, 'a'), row(1, 'b')]);
    await db.esiCache.delete([1, 'a']);
    expect(await db.esiCacheMeta.get([1, 'a'])).toBeUndefined();
    expect(await db.esiCacheMeta.get([1, 'b'])).toBeDefined();
  });

  it('a range delete (cachePurge shape) removes exactly the same range of meta', async () => {
    await db.esiCache.bulkPut([row(1, 'a'), row(1, 'b'), row(2, 'a'), row(0, 'a')]);
    await db.esiCache
      .where('[characterId+key]')
      .between([1, Dexie.minKey], [1, Dexie.maxKey], true, true)
      .delete();
    const left = (await db.esiCacheMeta.toArray()).map((m) => `${m.characterId}:${m.key}`);
    expect(left.sort()).toEqual(['0:a', '2:a']);
  });

  it('a filtered collection delete (keys shape) removes the matching meta', async () => {
    await db.esiCache.bulkPut([row(1, 'a'), row(1, 'b')]);
    await db.esiCache.filter((r) => r.key === 'a').delete();
    const left = (await db.esiCacheMeta.toArray()).map((m) => m.key);
    expect(left).toEqual(['b']);
  });

  it('clear() empties meta too (Settings "clear cache", test resets)', async () => {
    await db.esiCache.bulkPut([row(1, 'a'), row(0, 'b')]);
    await db.esiCache.clear();
    expect(await db.esiCacheMeta.count()).toBe(0);
  });

  it('value and meta commit or roll back together', async () => {
    await expect(
      db.transaction('rw', db.esiCache, async () => {
        await db.esiCache.put(row(1, 'atomic'));
        throw new Error('abort');
      })
    ).rejects.toThrow('abort');
    expect(await db.esiCache.get([1, 'atomic'])).toBeUndefined();
    expect(await db.esiCacheMeta.get([1, 'atomic'])).toBeUndefined();
  });

  it('reading meta never needs the value store', async () => {
    await db.esiCache.put(row(1, 'skills', 42));
    const meta = await db.transaction('r', db.esiCacheMeta, () =>
      db.esiCacheMeta.get([1, 'skills'])
    );
    expect(meta?.fetchedAt).toBe(42);
  });
});
