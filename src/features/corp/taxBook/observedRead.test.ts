// The persisted delta read over a fake Firestore and a real (fake-indexeddb) Dexie.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
const store = vi.hoisted(() => ({
  docs: new Map<string, Data>(),
  reads: [] as { path: string; since?: number }[],
  denied: false,
}));
const stamp = (ms: number) => ({ toMillis: () => ms });
vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  where: (_field: string, _op: string, value: { toMillis: () => number }) => ({
    since: value.toMillis(),
  }),
  query: (ref: { path: string }, constraint: { since: number }) => ({ ...ref, ...constraint }),
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  getDocs: async (ref: { path: string; since?: number }) => {
    store.reads.push({ path: ref.path, since: ref.since });
    if (store.denied) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    const prefix = `${ref.path}/`;
    const docs = [...store.docs]
      .filter(([path]) => path.startsWith(prefix))
      .filter(
        ([, d]) =>
          ref.since === undefined ||
          ((d.updatedAt as { toMillis: () => number } | undefined)?.toMillis() ?? -1) >= ref.since
      )
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
    return { docs };
  },
}));

import { db } from '@/db';
import { readObservedRows } from './observedRead';
import { OBSERVED_OVERLAP_MS } from './observedDelta';
import { forgetObservedCopy } from './observedStore';

const CORP = 98000001;
const PATH = `corps/${CORP}/observed`;
const T0 = 1_800_000_000_000;
const ok = Promise.resolve();
const open = (
  version: string | undefined,
  now: number,
  character = 7,
  gate: Promise<unknown> = ok,
  bookCreatedAt?: number
) => readObservedRows({} as never, character, CORP, version, gate, now, bookCreatedAt);
const put = (id: string, quantity: number, updatedMs?: number) =>
  store.docs.set(`${PATH}/${id}`, {
    quantity,
    ...(updatedMs !== undefined ? { updatedAt: stamp(updatedMs) } : {}),
  });

beforeEach(async () => {
  store.docs.clear();
  store.reads.length = 0;
  store.denied = false;
  await db.corpBookObserved.clear();
  await db.corpBookObservedMeta.clear();
});

describe('readObservedRows', () => {
  it('reads the collection once, then nothing while the stamp holds', async () => {
    put('a', 1, T0);
    put('b', 2, T0 + 1);
    expect(await open('v1', T0 + 10)).toHaveLength(2);
    store.reads.length = 0;

    expect(await open('v1', T0 + 20)).toHaveLength(2);

    expect(store.reads).toEqual([]);
  });

  it('strips the server stamp from the rows it returns', async () => {
    put('a', 1, T0);
    expect(await open('v1', T0)).toEqual([{ quantity: 1 }]);
  });

  it('reads only rows written since the watermark when the stamp moves, edits included', async () => {
    put('a', 1, T0);
    put('b', 2, T0 + 1);
    await open('v1', T0 + 10);
    put('b', 9, T0 + 1_000);
    put('c', 3, T0 + 2_000);
    store.reads.length = 0;

    const rows = await open('v2', T0 + 3_000);

    expect(store.reads).toEqual([{ path: PATH, since: T0 + 1 - OBSERVED_OVERLAP_MS }]);
    expect(rows.map((r) => (r as unknown as { quantity: number }).quantity).sort()).toEqual([
      1, 3, 9,
    ]);
    // The delta persisted: the next open on the new stamp reads nothing.
    store.reads.length = 0;
    await open('v2', T0 + 4_000);
    expect(store.reads).toEqual([]);
  });

  it('reads the whole collection while no row is stamped yet', async () => {
    put('a', 1);
    await open('v1', T0);
    store.reads.length = 0;
    await open('v2', T0 + 1);
    expect(store.reads).toEqual([{ path: PATH, since: undefined }]);
  });

  it('reads only the delta a long time later, not the whole collection', async () => {
    put('a', 1, T0);
    await open('v1', T0);
    put('z', 5, T0 + 5);
    store.reads.length = 0;

    const rows = await open('v2', T0 + 30 * 24 * 60 * 60 * 1000);

    expect(store.reads).toHaveLength(1);
    expect(store.reads[0].since).toBeDefined();
    expect(rows).toHaveLength(2);
  });

  it('reads the whole collection when the book was recreated while away', async () => {
    put('a', 1, T0);
    await open('v1', T0, 7, ok, 100);
    store.docs.clear();
    put('n', 9, T0 + 5);
    store.reads.length = 0;

    const rows = await open('v1', T0 + 10, 7, ok, 200);

    expect(store.reads).toEqual([{ path: PATH, since: undefined }]);
    expect(rows).toHaveLength(1);
  });

  it('wipes the copy and rethrows when the officer probe is refused', async () => {
    put('a', 1, T0);
    await open('v1', T0);
    const refused = Promise.reject(Object.assign(new Error('no'), { code: 'permission-denied' }));
    await expect(open('v1', T0 + 1, 7, refused)).rejects.toThrow('no');
    expect(await db.corpBookObserved.count()).toBe(0);
    expect(await db.corpBookObservedMeta.count()).toBe(0);
  });

  it('wipes the copy when the delta query itself is refused', async () => {
    put('a', 1, T0);
    await open('v1', T0);
    store.denied = true;
    await expect(open('v2', T0 + 1)).rejects.toThrow('denied');
    expect(await db.corpBookObserved.count()).toBe(0);
  });

  it('hands out no row before the probe settles', async () => {
    put('a', 1, T0);
    await open('v1', T0);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let settled = false;
    const pending = open('v1', T0 + 1, 7, gate).then((r) => ((settled = true), r));
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
    release();
    expect(await pending).toHaveLength(1);
  });

  it('keeps one book at a time: opening another Character drops the first copy', async () => {
    put('a', 1, T0);
    await open('v1', T0, 7);
    await open('v1', T0, 8);
    expect(await db.corpBookObserved.where('characterId').equals(7).count()).toBe(0);
    expect(await db.corpBookObserved.where('characterId').equals(8).count()).toBe(1);
  });

  it('forgetObservedCopy removes a Character copy', async () => {
    put('a', 1, T0);
    await open('v1', T0);
    await forgetObservedCopy(7, CORP);
    expect(await db.corpBookObservedMeta.count()).toBe(0);
  });
});
