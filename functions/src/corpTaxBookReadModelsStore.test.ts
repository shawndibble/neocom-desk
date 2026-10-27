import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { refreshReadModels } from './corpTaxBookReadModelsStore.js';

// A refresh that cannot write must never leave stale docs for a client to trust (#5259).
function fakeDb(failReads: boolean) {
  const deleted: string[] = [];
  const empty = { docs: [], data: () => ({}) };
  const col = (path: string): unknown => ({
    get: async () => {
      if (failReads) throw new Error('boom');
      return empty;
    },
    doc: (id: string) => ({ path: `${path}/${id}`, get: async () => empty }),
    where: () => col(path),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        collection: (sub: string) => col(`${name}/${id}/${sub}`),
        get: async () => empty,
      }),
    }),
    batch: () => ({
      set: vi.fn(),
      delete: (ref: { path: string }) => deleted.push(ref.path),
      commit: async () => undefined,
    }),
  } as unknown as Firestore;
  return { db, deleted };
}

describe('refreshReadModels', () => {
  it('deletes both docs when the rebuild fails, and never throws', async () => {
    const { db, deleted } = fakeDb(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(refreshReadModels(db, 1, 0)).resolves.toBeUndefined();
    expect(deleted.sort()).toEqual(['corps/1/readModels/minerList', 'corps/1/readModels/overview']);
  });

  it('leaves the docs alone when the rebuild works', async () => {
    const { db, deleted } = fakeDb(false);
    await refreshReadModels(db, 1, 0);
    expect(deleted).toEqual([]);
  });
});
