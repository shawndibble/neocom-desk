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
