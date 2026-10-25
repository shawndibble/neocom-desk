import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { firestoreAlertGrantStore } from './alertGrantStore.js';

describe('firestoreAlertGrantStore.getMany', () => {
  it('reads every Character in one getAll, mapping a missing grant to null', async () => {
    const grant = { seenTypes: ['A'], status: 'active' };
    const getAll = vi.fn(async (...refs: { id: string }[]) =>
      refs.map((r) => ({ exists: r.id === '1', data: () => grant }))
    );
    const db = {
      collection: () => ({ doc: (id: string) => ({ id }) }),
      getAll,
    } as unknown as Firestore;

    const found = await firestoreAlertGrantStore(db).getMany([1, 2]);

    expect(getAll).toHaveBeenCalledTimes(1);
    expect(found.get(1)).toEqual(grant);
    expect(found.get(2)).toBeNull();
  });

  it('skips the round trip for no Characters', async () => {
    const getAll = vi.fn();
    const db = { collection: () => ({ doc: () => ({}) }), getAll } as unknown as Firestore;

    expect((await firestoreAlertGrantStore(db).getMany([])).size).toBe(0);
    expect(getAll).not.toHaveBeenCalled();
  });
});
