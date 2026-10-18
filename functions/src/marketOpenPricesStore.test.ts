import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { mergeDays } from './marketOpenPrices.js';
import { writeOpenPrices } from './marketOpenPricesStore.js';

function fakeDb(stored: Record<string, unknown>) {
  const commits: Array<Array<{ id: string; data: unknown }>> = [];
  const db = {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    getAll: async (...refs: Array<{ id: string }>) =>
      refs.map((r) => ({ exists: r.id in stored, data: () => stored[r.id] })),
    batch: () => {
      const ops: Array<{ id: string; data: unknown }> = [];
      return {
        set: (ref: { id: string }, data: unknown) => ops.push({ id: ref.id, data }),
        commit: async () => void commits.push(ops),
      };
    },
  } as unknown as Firestore;
  return { db, commits };
}

describe('writeOpenPrices', () => {
  it('merges into existing documents and creates new ones', async () => {
    const { db, commits } = fakeDb({
      '1_34': { regionId: 1, typeId: 34, dates: ['2026-10-16'], buy: [1], sell: [2] },
    });
    const n = await writeOpenPrices(
      db,
      'marketOpenPrices',
      [
        { regionId: 1, typeId: 34, days: [{ date: '2026-10-17', buy: 3, sell: 4 }] },
        { regionId: 1, typeId: 35, days: [{ date: '2026-10-17', buy: null, sell: 5 }] },
      ],
      mergeDays
    );
    expect(n).toBe(2);
    expect(commits).toHaveLength(1);
    expect(commits[0][0]).toEqual({
      id: '1_34',
      data: {
        regionId: 1,
        typeId: 34,
        dates: ['2026-10-16', '2026-10-17'],
        buy: [1, 3],
        sell: [2, 4],
      },
    });
    expect(commits[0][1].data).toMatchObject({ dates: ['2026-10-17'], buy: [null], sell: [5] });
  });

  it('commits in batches of at most 500', async () => {
    const { db, commits } = fakeDb({});
    const items = Array.from({ length: 1201 }, (_, t) => ({
      regionId: 1,
      typeId: t,
      days: [{ date: '2026-10-17', buy: 1, sell: 1 }],
    }));
    expect(await writeOpenPrices(db, 'c', items, mergeDays)).toBe(1201);
    expect(commits.map((c) => c.length)).toEqual([500, 500, 201]);
  });
  it('reads the items lazily, one batch at a time, and reports progress after each commit', async () => {
    const { db, commits } = fakeDb({});
    let pulled = 0;
    function* items() {
      for (let t = 0; t < 1001; t++) {
        pulled++;
        // Never more than one batch ahead of what has been committed.
        expect(pulled - commits.length * 500).toBeLessThanOrEqual(500);
        yield { regionId: 1, typeId: t, days: [{ date: '2026-10-17', buy: 1, sell: 1 }] };
      }
    }
    const progress: number[] = [];
    expect(await writeOpenPrices(db, 'c', items(), mergeDays, (n) => progress.push(n))).toBe(1001);
    expect(progress).toEqual([500, 1000, 1001]);
  });
});
