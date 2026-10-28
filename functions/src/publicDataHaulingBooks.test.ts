import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { HaulingBookFold } from './haulingBooks.js';
import { SNAPSHOT_HUBS } from './marketOpenPrices.js';
import {
  HAULING_BOOKS_STATE_R2_KEY,
  haulingBooksR2Key,
  MIN_TYPES_PER_HUB,
  publishHaulingBooks,
} from './publicDataHaulingBooks.js';

const NOW = Date.parse('2026-10-28T03:00:00Z');
const PUBLISHED = Date.parse('2026-10-28T02:27:32Z');

function fakeR2() {
  const objects = new Map<string, Buffer | string>();
  return {
    objects,
    get: async (key: string) => {
      const body = objects.get(key);
      return body === undefined ? null : JSON.parse(body.toString());
    },
    put: async (key: string, body: Buffer | string) => {
      objects.set(key, body);
    },
  };
}

/** A fold stand-in: fills every hub with `types` types of one sell and one buy order. */
function fold(types: number, publishedAt: number | null = PUBLISHED) {
  return async (_url: string, books: HaulingBookFold) => {
    for (const hub of SNAPSHOT_HUBS) {
      for (let t = 1; t <= types; t += 1) {
        books.add(hub.stationId, t, false, 10, 5);
        books.add(hub.stationId, t, true, 9, 5);
      }
    }
    return { rows: types * SNAPSHOT_HUBS.length * 2, publishedAt };
  };
}

describe('publishHaulingBooks', () => {
  it('writes one gzipped object per hub station and records the snapshot', async () => {
    const r2 = fakeR2();
    const ran = await publishHaulingBooks({
      get: r2.get,
      put: r2.put,
      now: () => NOW,
      publishedAtImpl: async () => null,
      foldUrlImpl: fold(MIN_TYPES_PER_HUB),
    });
    expect(ran).toBe(true);
    const jita = SNAPSHOT_HUBS[0].stationId;
    const object = JSON.parse(
      gunzipSync(r2.objects.get(haulingBooksR2Key(jita)) as Buffer).toString()
    );
    expect(object).toMatchObject({ stationId: jita, asOf: PUBLISHED, lastSyncedAt: NOW });
    expect(object.types[1]).toEqual([[[10, 5, 1]], [[9, 5, 1]]]);
    expect(JSON.parse(r2.objects.get(HAULING_BOOKS_STATE_R2_KEY) as string).asOf).toBe(PUBLISHED);
    expect(r2.objects.size).toBe(SNAPSHOT_HUBS.length + 1);
  });

  it('skips a snapshot it already published', async () => {
    const r2 = fakeR2();
    const deps = {
      get: r2.get,
      put: r2.put,
      now: () => NOW,
      publishedAtImpl: async () => PUBLISHED,
      foldUrlImpl: fold(MIN_TYPES_PER_HUB),
    };
    await publishHaulingBooks(deps);
    const before = new Map(r2.objects);
    let downloaded = false;
    const ran = await publishHaulingBooks({
      ...deps,
      foldUrlImpl: async (url, books) => {
        downloaded = true;
        return fold(MIN_TYPES_PER_HUB)(url, books);
      },
    });
    expect(ran).toBe(false);
    expect(downloaded).toBe(false);
    expect(r2.objects).toEqual(before);
  });

  it('publishes nothing when a hub has too few types', async () => {
    const r2 = fakeR2();
    await expect(
      publishHaulingBooks({
        get: r2.get,
        put: r2.put,
        now: () => NOW,
        publishedAtImpl: async () => null,
        foldUrlImpl: fold(MIN_TYPES_PER_HUB - 1),
      })
    ).rejects.toThrow(/too few types/);
    expect(r2.objects.size).toBe(0);
  });

  it('keeps no record when a write failed, so the next run repeats it', async () => {
    const r2 = fakeR2();
    await expect(
      publishHaulingBooks({
        get: r2.get,
        put: async (key, body) => {
          if (key === haulingBooksR2Key(SNAPSHOT_HUBS[1].stationId)) throw new Error('R2 down');
          await r2.put(key, body);
        },
        now: () => NOW,
        publishedAtImpl: async () => null,
        foldUrlImpl: fold(MIN_TYPES_PER_HUB),
      })
    ).rejects.toThrow(/1 hubs failed/);
    expect(r2.objects.has(HAULING_BOOKS_STATE_R2_KEY)).toBe(false);
  });

  it('still publishes when the last-run read fails or the snapshot has no date', async () => {
    const r2 = fakeR2();
    const ran = await publishHaulingBooks({
      get: async () => {
        throw new Error('R2 GET failed: 500');
      },
      put: r2.put,
      now: () => NOW,
      publishedAtImpl: async () => null,
      foldUrlImpl: fold(MIN_TYPES_PER_HUB, null),
    });
    expect(ran).toBe(true);
    expect(JSON.parse(r2.objects.get(HAULING_BOOKS_STATE_R2_KEY) as string).asOf).toBe(NOW);
  });
});
