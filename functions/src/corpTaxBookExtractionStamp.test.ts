import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  loadStampContext,
  restampStructures,
  stampBook,
  stampRows,
} from './corpTaxBookExtractionStamp.js';

type Row = Record<string, unknown>;

const PULL = {
  structureId: 1000,
  moonId: 40,
  extractionStartTime: '2026-10-10T12:00:00.000Z',
  chunkArrivalTime: '2026-10-16T12:00:00.000Z',
  naturalDecayTime: '2026-10-16T15:00:00.000Z',
};
const PULL_ID = `1000_${Date.parse(PULL.extractionStartTime)}`;

/** Just enough Firestore: one corp's book doc, `extractions`, `observed` rows and the `meta` marker. */
function fakeDb(rows: Record<string, Row>, extractions: Row[] = [PULL], bookData: Row = {}) {
  const state = { rows, marked: undefined as Row | undefined, commits: 0, bookData };
  const snap = (id: string) => ({
    id,
    ref: { id },
    updateTime: { t: id },
    get: (f: string) => state.rows[id][f],
    data: () => state.rows[id],
  });
  const query = (after?: string, max = Infinity, structureId?: number) => ({
    orderBy: () => query(after, max, structureId),
    select: () => query(after, max, structureId),
    limit: (n: number) => query(after, n, structureId),
    startAfter: (id: string) => query(id, max, structureId),
    where: (_f: string, _op: string, v: number) => query(after, max, v),
    get: async () => {
      const ids = Object.keys(state.rows)
        .sort()
        .filter((id) => after === undefined || id > after)
        .filter((id) => structureId === undefined || state.rows[id].structureId === structureId)
        .slice(0, max);
      const docs = ids.map(snap);
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  });
  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ data: () => state.bookData }),
        collection: (name: string) => {
          if (name === 'observed') return { ...query(), doc: (id: string) => ({ id }) };
          if (name === 'extractions')
            return {
              get: async () => ({
                docs: extractions.map((x) => ({
                  id: `${x.structureId}_${Date.parse(String(x.extractionStartTime))}`,
                  data: () => x,
                })),
              }),
            };
          return {
            doc: () => ({
              get: async () => ({ exists: state.marked !== undefined }),
              set: async (v: Row) => {
                state.marked = v;
              },
            }),
          };
        },
      }),
    }),
    batch: () => {
      const updates: { id: string; data: Row }[] = [];
      return {
        update: (r: { id: string }, data: Row) => updates.push({ id: r.id, data }),
        commit: async () => {
          state.commits += 1;
          for (const u of updates) Object.assign(state.rows[u.id], u.data);
        },
      };
    },
  };
  return { db: db as unknown as Firestore, state };
}

const row = (date: string, structureId = 1000, over: Row = {}): Row => ({
  structureId,
  date,
  ...over,
});

describe('stampBook', () => {
  it('stamps rows a pull covers, leaves the rest and counts them, and marks the book', async () => {
    const { db, state } = fakeDb({
      a: row('2026-10-16'),
      b: row('2026-10-18'),
      c: row('2026-10-25'),
      d: row('2026-10-16', 2000),
      e: row('2026-10-16', 1000, { extractionId: 'held' }),
    });
    expect(await stampBook(db, 1, () => 9)).toBe(2);
    expect(state.rows.a.extractionId).toBe(PULL_ID);
    expect(state.rows.b.extractionId).toBe(PULL_ID);
    expect(state.rows.c.extractionId).toBeUndefined();
    expect(state.rows.d.extractionId).toBeUndefined();
    expect(state.rows.e.extractionId).toBe('held');
    expect(state.marked).toEqual({ at: 9, stamped: 2, unassigned: 2 });
  });

  it('never touches updatedAt, so no device re-reads a row for a stamp', async () => {
    const updatedAt = { toMillis: () => 5 };
    const { db, state } = fakeDb({ a: row('2026-10-16', 1000, { updatedAt }) });
    await stampBook(db, 1, () => 9);
    expect(state.rows.a.updatedAt).toBe(updatedAt);
  });

  it('uses the structure’s own expiry from the book doc', async () => {
    const { db, state } = fakeDb({ a: row('2026-10-20') }, [PULL], {
      structureExpiryHours: { '1000': 96 },
    });
    await stampBook(db, 1, () => 9);
    expect(state.rows.a.extractionId).toBe(PULL_ID);
  });

  it('walks every page, and does nothing once marked', async () => {
    const rows: Record<string, Row> = {};
    for (let i = 0; i < 1000; i++) rows[`r${String(i).padStart(4, '0')}`] = row('2026-10-16');
    const { db, state } = fakeDb(rows);
    expect(await stampBook(db, 1, () => 9)).toBe(1000);
    expect(state.commits).toBe(3);
    expect(await stampBook(db, 1, () => 9)).toBe(0);
  });
});

describe('restampStructures', () => {
  it('re-stamps after a correction: a cancel clears the stamp, nothing else changes', async () => {
    const { db, state } = fakeDb(
      {
        a: row('2026-10-16', 1000, { extractionId: PULL_ID }),
        b: row('2026-10-16', 2000, { extractionId: 'other' }),
      },
      [{ ...PULL, cancelledAt: '2026-10-16T13:00:00.000Z' }]
    );
    expect(await restampStructures(db, 1, [1000])).toBe(1);
    expect(state.rows.a).not.toHaveProperty('extractionId', PULL_ID);
    expect(state.rows.b.extractionId).toBe('other');
  });

  it('stamps old rows a newly arrived Extraction covers', async () => {
    const { db, state } = fakeDb({ a: row('2026-10-17') });
    expect(await restampStructures(db, 1, [1000])).toBe(1);
    expect(state.rows.a.extractionId).toBe(PULL_ID);
    expect(await restampStructures(db, 1, [])).toBe(0);
  });
});

describe('loadStampContext', () => {
  it('keeps a stored laser time when the incoming Extraction leaves it undefined', async () => {
    const fired = { ...PULL, laserFiredAt: '2026-10-17T12:00:00.000Z' };
    const { db } = fakeDb({}, [fired]);
    const ctx = await loadStampContext(db, 1, [{ ...PULL, laserFiredAt: undefined }]);
    expect(ctx.extractions[0]?.laserFiredAt).toBe('2026-10-17T12:00:00.000Z');
  });
});

describe('stampRows', () => {
  it('stamps with the stored Extractions plus the ones the same sync writes', async () => {
    const { db } = fakeDb({}, []);
    const ctx = await loadStampContext(db, 1, [PULL]);
    const [stamped] = stampRows(
      [
        {
          structureId: 1000,
          characterId: 1,
          recordedCorporationId: 1,
          typeId: 1,
          date: '2026-10-16',
          quantity: 1,
          cachedAt: '2026-10-16T00:00:00Z',
        },
      ],
      ctx
    );
    expect(stamped.extractionId).toBe(PULL_ID);
  });
});
