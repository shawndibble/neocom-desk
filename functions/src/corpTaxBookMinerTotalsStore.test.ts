import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { refreshAfterEvent } from './corpTaxBookMinerTotalsStore.js';

// A refresh that cannot write must never leave a stale totals doc over the Miner page's header (#5704).
function fakeDb(failReads: boolean) {
  const deleted: string[] = [];
  const empty = { docs: [], data: () => ({}), exists: false, get: () => undefined };
  const col = (path: string): unknown => ({
    get: async () => {
      if (failReads) throw new Error('boom');
      return empty;
    },
    doc: (id: string) => ({ id, path: `${path}/${id}`, get: async () => empty }),
    where: () => col(path),
    listDocuments: async () => ['m1', 'm2'].map((id) => ({ id, path: `${path}/${id}` })),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        collection: (sub: string) => col(`${name}/${id}/${sub}`),
        get: async () => empty,
      }),
    }),
    getAll: async (...refs: unknown[]) => refs.map(() => empty),
    batch: () => ({
      set: vi.fn(),
      delete: (ref: { path: string }) => deleted.push(ref.path),
      commit: async () => undefined,
    }),
  } as unknown as Firestore;
  return { db, deleted };
}

describe('refreshAfterEvent', () => {
  it("deletes the Miners' totals docs when the refresh fails, and never throws", async () => {
    const { db, deleted } = fakeDb(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(refreshAfterEvent(db, 1, ['g1', 'solo:5'])).resolves.toBeUndefined();
    expect(deleted.sort()).toEqual(['corps/1/minerTotals/g1', 'corps/1/minerTotals/solo:5']);
  });

  it('deletes every totals doc when a whole-book refresh fails', async () => {
    const { db, deleted } = fakeDb(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await refreshAfterEvent(db, 1, { minerIds: [], statementIds: [], paymentIds: [], all: true });
    expect(deleted.sort()).toEqual(['corps/1/minerTotals/m1', 'corps/1/minerTotals/m2']);
  });

  it('deletes nothing when the refresh works', async () => {
    const { db, deleted } = fakeDb(false);
    await refreshAfterEvent(db, 1, ['g1']);
    expect(deleted).toEqual([]);
  });
});
