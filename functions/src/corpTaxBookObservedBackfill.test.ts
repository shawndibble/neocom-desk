import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { backfillObservedUpdatedAt } from './corpTaxBookObservedBackfill.js';

type Row = { updatedAt?: unknown };

/** Just enough Firestore for the pass: one corp's `observed` rows and `meta` marker. */
function fakeDb(rows: Record<string, Row>, marked = false) {
  const state = { rows, marked, commits: 0 };
  const ref = (id: string) => ({ id });
  const query = (after?: string, max = Infinity) => ({
    orderBy: () => query(after, max),
    select: () => query(after, max),
    limit: (n: number) => query(after, n),
    startAfter: (id: string) => query(id, max),
    get: async () => {
      const ids = Object.keys(state.rows)
        .sort()
        .filter((id) => after === undefined || id > after)
        .slice(0, max);
      const docs = ids.map((id) => ({
        id,
        ref: ref(id),
        updateTime: { t: id },
        get: (f: string) => (state.rows[id] as Record<string, unknown>)[f],
      }));
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  });
  const db = {
    collection: () => ({
      doc: () => ({
        collection: (name: string) =>
          name === 'observed'
            ? query()
            : {
                doc: () => ({
                  get: async () => ({ exists: state.marked }),
                  set: async () => {
                    state.marked = true;
                  },
                }),
              },
      }),
    }),
    batch: () => {
      const updates: { id: string; data: Row }[] = [];
      return {
        update: (r: { id: string }, data: Row, pre?: unknown) => {
          if (!pre) throw new Error('update without a precondition');
          updates.push({ id: r.id, data });
        },
        commit: async () => {
          state.commits += 1;
          for (const u of updates) Object.assign(state.rows[u.id], u.data);
        },
      };
    },
  };
  return { db: db as unknown as Firestore, state };
}

describe('backfillObservedUpdatedAt', () => {
  it('stamps only rows with no updatedAt and marks the book done', async () => {
    const stamped = { toMillis: () => 5 };
    const { db, state } = fakeDb({ a: {}, b: { updatedAt: stamped }, c: {} });
    expect(await backfillObservedUpdatedAt(db, 1, () => 9)).toBe(2);
    expect(state.rows.b.updatedAt).toBe(stamped);
    expect(state.rows.a.updatedAt).toBeDefined();
    expect(state.rows.c.updatedAt).toBeDefined();
    expect(state.marked).toBe(true);
  });

  it('walks every page', async () => {
    const rows: Record<string, Row> = {};
    for (let i = 0; i < 1000; i++) rows[`r${String(i).padStart(4, '0')}`] = {};
    const { db, state } = fakeDb(rows);
    expect(await backfillObservedUpdatedAt(db, 1, () => 9)).toBe(1000);
    expect(state.commits).toBe(3);
  });

  it('restarts from the top after a run that died midway, skipping stamped rows', async () => {
    const stamped = { toMillis: () => 5 };
    const { db, state } = fakeDb({ a: { updatedAt: stamped }, b: {} });
    expect(await backfillObservedUpdatedAt(db, 1, () => 9)).toBe(1);
    expect(state.rows.a.updatedAt).toBe(stamped);
  });

  it('does nothing once the book is marked', async () => {
    const { db, state } = fakeDb({ a: {} }, true);
    expect(await backfillObservedUpdatedAt(db, 1, () => 9)).toBe(0);
    expect(state.rows.a.updatedAt).toBeUndefined();
  });
});
