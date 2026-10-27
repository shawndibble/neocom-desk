// readMinerBookData (issue #5258): which documents one Miner's page reads.
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
import { clearBookCache } from './bookCache';
import { readMinerBookData } from './bookClient';

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
  store.docs.set(BOOK, { active: true, startDate: '2026-08-01', bookVersion: 'b1' });
  store.docs.set(`${BOOK}/meta/paid`, { ids: [] });
  store.docs.set(`${BOOK}/miners/m1`, { id: 'm1', characterIds: [1, 2], mainCharacterId: 1 });
  store.docs.set(`${BOOK}/minerTotals/m1`, { schema: 1, owed: 5, credit: 0, lastPaidAt: null });
  const st = (id: string, minerId: string, from: string) =>
    store.docs.set(`${BOOK}/statements/${id}`, {
      id,
      minerId,
      coversFrom: from,
      coversThrough: from,
      issuedAt: `${from}T00:00:00Z`,
      lines: [],
    });
  st('s-old', 'm1', '2026-08-01');
  st('s-new', 'm1', '2026-09-01');
  st('s-other', 'm9', '2026-09-01');
  store.docs.set(`${BOOK}/payments/p1`, { id: 'p1', minerId: 'm1' });
  store.docs.set(`${BOOK}/payments/p2`, { id: 'p2', minerId: 'm9' });
  store.docs.set(`${BOOK}/dismissals/d1`, { id: 'd1' });
  store.docs.set(`${BOOK}/declarations/x1`, { id: 'x1', statementId: 's-new' });
  store.docs.set(`${BOOK}/declarations/x2`, { id: 'x2', statementId: 's-other' });
  obs('o1', 1, '2026-08-10'); // before the newest Statement: frozen, never read
  obs('o2', 1, '2026-09-10');
  obs('o3', 2, '2026-09-12');
  obs('o4', 9, '2026-09-12'); // someone else's
});

describe('readMinerBookData', () => {
  it('reads this Miner and the open window, not the ledger', async () => {
    const read = await readMinerBookData(7, CORP, 'm1');
    const d = read!.data;
    expect(read!.from).toBe('2026-09-01');
    expect(read!.totals).toMatchObject({ owed: 5 });
    expect(d.state.statements.map((s) => s.id).sort()).toEqual(['s-new', 's-old']);
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
    const read = await readMinerBookData(7, CORP, 'm1');
    expect(read!.data.observed.map((r) => r.date).sort()).toEqual(['2026-09-10', '2026-09-12']);
  });

  it('survives a totals doc that is not deployed', async () => {
    store.docs.delete(`${BOOK}/minerTotals/m1`);
    const read = await readMinerBookData(7, CORP, 'm1');
    expect(read!.totals).toBeUndefined();
  });

  it('reads a solo Miner by its character, and a quiet one by its newest row only', async () => {
    store.docs.delete(`${BOOK}/miners/m1`);
    obs('o5', 5, '2026-07-30', 98000099); // a guest's last row, before the book
    obs('o6', 5, '2026-06-01', 98000099);
    store.reads.length = 0;
    const read = await readMinerBookData(7, CORP, 'solo:5');
    expect(read!.data.observed).toEqual([]);
    expect(store.reads.filter((p) => p.includes('/observed/'))).toEqual([`${BOOK}/observed/o5`]);
  });
});
