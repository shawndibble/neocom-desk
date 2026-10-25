// readBookData / readBookState over the version marker (issue #5047): what
// re-opening a book costs, and what an edit makes it re-read.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
const store = vi.hoisted(() => ({
  docs: new Map<string, Data>(),
  reads: [] as string[],
  denied: new Set<string>(),
}));
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  getDoc: async (ref: { path: string }) => {
    store.reads.push(ref.path);
    if (store.denied.has(ref.path))
      throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    const data = store.docs.get(ref.path);
    return { exists: () => data !== undefined, data: () => data, get: () => undefined };
  },
  getDocs: async (ref: { path: string }) => {
    store.reads.push(ref.path);
    const prefix = `${ref.path}/`;
    const docs = [...store.docs]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
    return { docs };
  },
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/auth/session', () => ({ getValidAccessToken: vi.fn() }));

import { clearBookCache } from './bookCache';
import { readBookData, readBookState } from './bookClient';

const CORP = 98000001;
const BOOK = `corps/${CORP}`;
const COLLECTIONS = [
  'miners',
  'statements',
  'payments',
  'dismissals',
  'extractions',
  'observed',
  'declarations',
  'adjustments',
  'writeOffs',
  'feeders',
  'meta',
];

function stamped(overrides: Record<string, string> = {}): Data {
  return {
    active: true,
    startDate: '2026-10-01',
    bookVersion: 'b1',
    collectionVersions: {
      ...Object.fromEntries(COLLECTIONS.map((c) => [c, `${c}-1`])),
      ...overrides,
    },
  };
}

beforeEach(() => {
  clearBookCache();
  store.docs.clear();
  store.reads.length = 0;
  store.denied.clear();
  store.docs.set(BOOK, stamped());
  store.docs.set(`${BOOK}/miners/m1`, { id: 'm1', characterIds: [1] });
  store.docs.set(`${BOOK}/statements/s1`, { id: 's1' });
  store.docs.set(`${BOOK}/observed/o1`, { date: '2026-10-02', typeId: 1, characterId: 1 });
  store.docs.set(`${BOOK}/feeders/5`, { corporationId: 5, status: 'active' });
  store.docs.set(`${BOOK}/feeders/5/payouts/p1`, { amount: 1 });
  store.docs.set(`${BOOK}/meta/paid`, { ids: ['s0'] });
});

describe('readBookData over the version marker', () => {
  it('re-opens an unchanged book for its settings document and the officer-only probe', async () => {
    const first = await readBookData(7, CORP);
    store.reads.length = 0;

    const again = await readBookData(7, CORP);

    expect(store.reads).toEqual([BOOK, `${BOOK}/meta/paid`]);
    expect(again).toEqual(first);
    expect(again?.feeders?.[0]?.payouts).toEqual([{ amount: 1, id: 'p1' }]);
  });

  it('re-reads only the collection an edit restamped', async () => {
    await readBookData(7, CORP);
    store.docs.set(`${BOOK}/statements/s2`, { id: 's2' });
    store.docs.set(BOOK, stamped({ statements: 'statements-2' }));
    store.reads.length = 0;

    const data = await readBookData(7, CORP);

    expect(store.reads.sort()).toEqual([BOOK, `${BOOK}/meta/paid`, `${BOOK}/statements`].sort());
    expect(data?.state.statements).toEqual([{ id: 's1' }, { id: 's2' }]);
  });

  it('re-reads a feeder and its payouts when the feeders stamp moves', async () => {
    await readBookData(7, CORP);
    store.docs.set(`${BOOK}/feeders/5/payouts/p2`, { amount: 2 });
    store.docs.set(BOOK, stamped({ feeders: 'feeders-2' }));
    store.reads.length = 0;

    const data = await readBookData(7, CORP);

    expect(store.reads).toContain(`${BOOK}/feeders/5/payouts`);
    expect(data?.feeders?.[0]?.payouts).toHaveLength(2);
  });

  it('reads everything on every open while the server has not stamped the book', async () => {
    store.docs.set(BOOK, { active: true, startDate: '2026-10-01' });
    await readBookData(7, CORP);
    const firstCount = store.reads.length;
    store.reads.length = 0;

    await readBookData(7, CORP);

    expect(store.reads).toHaveLength(firstCount);
    expect(firstCount).toBeGreaterThan(10);
  });

  it('shares the copy with readBookState, so a sync re-reads only what it changed', async () => {
    await readBookData(7, CORP);
    store.reads.length = 0;

    const state = await readBookState(7, CORP);

    expect(store.reads).toEqual([BOOK, `${BOOK}/meta/paid`]);
    expect(state?.statements).toEqual([{ id: 's1' }]);
    expect(state?.paidStatementIds).toEqual(new Set(['s0']));
  });

  it('serves no copy to a Character the rules now refuse', async () => {
    await readBookData(7, CORP);
    store.denied.add(`${BOOK}/meta/paid`);

    await expect(readBookData(7, CORP)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('is null, reading nothing else, when the corporation has no book', async () => {
    store.docs.delete(BOOK);
    expect(await readBookData(7, CORP)).toBeNull();
    expect(store.reads).toEqual([BOOK]);
  });
});
