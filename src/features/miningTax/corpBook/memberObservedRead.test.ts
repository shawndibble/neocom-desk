import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore/lite';
import type { PartStore } from '@/features/corp/taxBook/bookCache';
import { readMemberObserved } from './memberObservedRead';

interface Filter {
  field: string;
  op: string;
  value: unknown;
}
const store = vi.hoisted(() => ({
  rows: [] as { id: string; data: Record<string, unknown> }[],
  refuseUids: false,
}));
vi.mock('firebase/firestore/lite', () => ({
  collection: () => ({}),
  where: (field: string, op: string, value: unknown): Filter => ({ field, op, value }),
  query: (_col: unknown, ...filters: Filter[]) => filters,
  getDocs: async (filters: Filter[]) => {
    if (store.refuseUids && filters.some((f) => f.field === 'uids'))
      throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    const docs = store.rows.filter((r) =>
      filters.every((f) =>
        f.op === '=='
          ? r.data[f.field] === f.value
          : f.op === 'array-contains'
            ? Array.isArray(r.data[f.field]) && (r.data[f.field] as unknown[]).includes(f.value)
            : true
      )
    );
    return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
  },
}));

const NOWHERE: PartStore = {
  load: async () => undefined,
  save: async () => {},
  forget: async () => {},
};
const read = () =>
  readMemberObserved({
    db: {} as Firestore,
    key: 'member:1:98000001',
    root: 'corps/98000001',
    uid: 'char:1',
    version: undefined,
    store: NOWHERE,
  });

/** A store holding one copy, read under readers epoch 0 at the book's current stamp. */
function holding(rows: string[]): PartStore {
  return {
    load: async () => ({
      version: 'v1',
      at: Date.now(),
      data: {
        rows: rows.map((id) => ({ id, row: { uid: 'char:1', characterId: 1 }, updatedMs: 1 })),
        fullAt: Date.now(),
        watermark: 1,
        readersEpoch: 0,
      },
    }),
    save: async () => {},
    forget: async () => {},
  };
}

const readUnder = (store: PartStore, key: string, readersEpoch: number) =>
  readMemberObserved({
    db: {} as Firestore,
    key,
    root: 'corps/98000001',
    uid: 'char:1',
    version: 'v1',
    store,
    readersEpoch,
  });

describe("readMemberObserved: the main's and the alt's mined rows", () => {
  it("reads the alt's rows by uids beside the own rows by uid, one row once", async () => {
    store.rows = [
      { id: 'own', data: { uid: 'char:1', uids: ['char:1', 'char:2'], characterId: 1 } },
      { id: 'alt', data: { uid: 'char:2', uids: ['char:2', 'char:1'], characterId: 2 } },
      { id: 'other', data: { uid: 'char:9', uids: ['char:9'], characterId: 9 } },
    ];
    store.refuseUids = false;
    expect((await read()).map((r) => r.id).sort()).toEqual(['alt', 'own']);
  });

  it('keeps the own rows on an older server: no uids yet, or the read refused', async () => {
    store.rows = [{ id: 'own', data: { uid: 'char:1', characterId: 1 } }];
    expect((await read()).map((r) => r.id)).toEqual(['own']);
    store.refuseUids = true;
    expect((await read()).map((r) => r.id)).toEqual(['own']);
  });
});

describe('readMemberObserved: the readers epoch', () => {
  it("reads again whole when it moved: an alt's backfilled older rows reach a main that had a copy", async () => {
    store.refuseUids = false;
    store.rows = [
      { id: 'own', data: { uid: 'char:1', uids: ['char:1', 'char:2'], characterId: 1 } },
      { id: 'alt-old', data: { uid: 'char:2', uids: ['char:2', 'char:1'], characterId: 2 } },
    ];
    // Same epoch, same stamp: the copy stands.
    expect((await readUnder(holding(['own']), 'epoch-a', 0)).map((r) => r.id)).toEqual(['own']);
    // The backfill moved the epoch: read again whole.
    expect((await readUnder(holding(['own']), 'epoch-b', 1)).map((r) => r.id).sort()).toEqual([
      'alt-old',
      'own',
    ]);
  });

  it("replaces the copy when it moved: a removed Character's device drops the group's rows", async () => {
    store.refuseUids = false;
    // Taken out of the group: the server no longer lists this Character on the group's rows.
    store.rows = [{ id: 'own', data: { uid: 'char:1', uids: ['char:1'], characterId: 1 } }];
    const kept = await readUnder(holding(['own', 'group-row']), 'epoch-c', 2);
    expect(kept.map((r) => r.id)).toEqual(['own']);
  });
});
