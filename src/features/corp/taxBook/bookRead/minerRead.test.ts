import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
type Filter = { field: string; op: string; value: unknown };
const store = vi.hoisted(() => ({
  docs: new Map<string, Data>(),
  reads: [] as string[],
  noIndex: false,
}));
vi.mock('firebase/firestore/lite', () => {
  const read = (path: string) => {
    store.reads.push(path);
  };
  return {
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    orderBy: (field: string, dir: string) => ({ order: field, dir }),
    limit: (n: number) => ({ limit: n }),
    query: (ref: { path: string }, ...parts: unknown[]) => ({ ...ref, parts }),
    Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
    getDoc: async (ref: { path: string }) => {
      read(ref.path);
      const data = store.docs.get(ref.path);
      return { exists: () => data !== undefined, data: () => data };
    },
    getDocs: async (ref: {
      path: string;
      parts?: (Filter & { order?: string; limit?: number })[];
    }) => {
      const parts = ref.parts ?? [];
      const range = parts.some((p) => p.op === '>=');
      if (store.noIndex && range && parts.some((p) => p.op === 'in'))
        throw Object.assign(new Error('index'), { code: 'failed-precondition' });
      const prefix = `${ref.path}/`;
      let docs = [...store.docs]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .filter(([, data]) =>
          parts.every((p) => {
            if (p.op === '==') return data[p.field] === p.value;
            if (p.op === 'in') return (p.value as unknown[]).includes(data[p.field]);
            if (p.op === '>=') return (data[p.field] as string) >= (p.value as string);
            return true;
          })
        );
      if (parts.some((p) => p.order))
        docs = docs.sort((a, b) => ((b[1].date as string) > (a[1].date as string) ? 1 : -1));
      const cap = parts.find((p) => p.limit)?.limit;
      if (cap) docs = docs.slice(0, cap);
      for (const [path] of docs) read(path);
      return {
        docs: docs.map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data })),
      };
    },
  };
});
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/auth/session', () => ({ getValidAccessToken: vi.fn() }));

import { db } from '@/db';
import { clearBookCache } from '../bookCache';
import { bookPartsFor, readBook } from '.';

const readMiner = (minerId: string) =>
  readBook(7, CORP, { parts: bookPartsFor('miners', 'miner'), minerId });

const CORP = 98000001;
const BOOK = `corps/${CORP}`;
const obs = (id: string, characterId: number, date: string, corp = CORP) =>
  store.docs.set(`${BOOK}/observed/${id}`, {
    characterId,
    date,
    typeId: 1,
    quantity: 10,
    structureId: 1001,
    recordedCorporationId: corp,
    cachedAt: `${date}T00:00:00Z`,
  });

beforeEach(async () => {
  clearBookCache();
  await db.corpBookParts.clear();
  store.docs.clear();
  store.reads.length = 0;
  store.noIndex = false;
  store.docs.set(BOOK, {
    active: true,
    startDate: '2026-08-01',
    bookVersion: 'b1',
    collectionVersions: { lateNotices: 'v1' },
  });
  store.docs.set(`${BOOK}/meta/paid`, { ids: [] });
  store.docs.set(`${BOOK}/miners/m1`, { id: 'm1', characterIds: [1, 2], mainCharacterId: 1 });
  const st = (id: string, minerId: string, from: string) =>
    store.docs.set(`${BOOK}/lateNotices/${id}`, {
      id,
      minerId,
      issuedAt: `${from}T00:00:00Z`,
      lines: [],
      mail: { sent: 1, manualSent: 0, remindersStopped: false },
    });
  st('s-old', 'm1', '2026-08-01');
  st('s-new', 'm1', '2026-09-01');
  st('s-other', 'm9', '2026-09-01');
  store.docs.set(`${BOOK}/payments/p1`, { id: 'p1', minerId: 'm1' });
  store.docs.set(`${BOOK}/payments/p2`, { id: 'p2', minerId: 'm9' });
  store.docs.set(`${BOOK}/dismissals/d1`, { id: 'd1' });
  store.docs.set(`${BOOK}/declarations/x1`, { id: 'x1', statementId: 's-new' });
  store.docs.set(`${BOOK}/declarations/x2`, { id: 'x2', statementId: 's-other' });
  obs('o1', 1, '2026-07-10');
  obs('o2', 1, '2026-09-10');
  obs('o3', 2, '2026-09-12');
  obs('o4', 9, '2026-09-12');
});

describe('readBook for one Miner', () => {
  it('reads this Miner from the book’s start while it has no checkpoint, not the ledger', async () => {
    const d = (await readMiner('m1'))!;
    expect(d.scopedMiner).toBe('m1');
    expect(d.minerScope?.from).toBe('2026-08-01');
    expect(d.state.notices.map((n) => n.id).sort()).toEqual(['s-new', 's-old']);
    expect(d.state.payments.map((p) => p.id)).toEqual(['p1']);
    expect(d.declarations.map((x) => x.id)).toEqual(['x1']);
    expect(d.state.miners).toHaveLength(1);
    expect(d.observed.map((r) => `${r.characterId}:${r.date}`).sort()).toEqual([
      '1:2026-09-10',
      '2:2026-09-12',
    ]);
    expect(store.reads.filter((p) => p.startsWith(`${BOOK}/observed/`)).sort()).toEqual([
      `${BOOK}/observed/o2`,
      `${BOOK}/observed/o3`,
    ]);
  });

  it('survives a missing composite index by filtering the window here', async () => {
    store.noIndex = true;
    const read = await readMiner('m1');
    expect(read!.observed.map((r) => r.date).sort()).toEqual(['2026-09-10', '2026-09-12']);
  });

  it('reads a solo Miner by its character, from the book’s start', async () => {
    store.docs.delete(`${BOOK}/miners/m1`);
    obs('o5', 5, '2026-07-30', 98000099);
    obs('o6', 5, '2026-06-01', 98000099);
    store.reads.length = 0;
    const read = await readMiner('solo:5');
    expect(read!.observed).toEqual([]);
    expect(store.reads.filter((p) => p.includes('/observed/'))).toEqual([]);
  });

  it('claims only the parts it read, and holds every field a whole read of them holds', async () => {
    const scoped = (await readMiner('m1'))!;
    const whole = (await readBook(7, CORP, { parts: scoped.parts }))!;
    expect([...scoped.parts].sort()).toEqual(['answers', 'core', 'ledger', 'observed']);
    expect(fieldsOf(scoped)).toEqual(fieldsOf(whole));
  });

  it("reads the disputes it claims, this Miner's only, and the uncounted donations", async () => {
    store.docs.set(BOOK, {
      active: true,
      startDate: '2026-08-01',
      bookVersion: 'b1',
      collectionVersions: { disputes: 'v1', meta: 'v1' },
    });
    const dispute = (id: string, minerId: string) =>
      store.docs.set(`${BOOK}/disputes/${id}`, {
        id,
        minerId,
        date: '2026-09-12',
        lines: [{ recordKey: 'k', typeId: 1, quantity: 1, payeeName: 'Corp' }],
        by: 9,
        at: '2026-09-13T00:00:00Z',
      });
    dispute('q1', 'm1');
    dispute('q2', 'm9');
    store.docs.set(`${BOOK}/meta/uncounted`, {
      donations: [
        { id: 'u1', refId: 1, division: 3, characterId: 9, amount: 5, at: '2026-09-13T00:00:00Z' },
      ],
    });
    const d = (await readMiner('m1'))!;
    expect(d.disputes?.map((x) => x.id)).toEqual(['q1']);
    expect(store.reads).not.toContain(`${BOOK}/disputes/q2`);
    expect(d.uncounted?.map((x) => x.id)).toEqual(['u1']);
  });
});

function fieldsOf(data: object): string[] {
  const state = (data as { state: object }).state;
  return [
    ...Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k),
    ...Object.entries(state)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => `state.${k}`),
  ]
    .filter((k) => !SCOPE_ONLY.has(k))
    .sort();
}
const SCOPE_ONLY = new Set(['scopedMiner', 'minerScope', 'readModels']);
