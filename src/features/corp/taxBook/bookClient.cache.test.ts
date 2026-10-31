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
  query: (ref: { path: string }) => ref,
  where: vi.fn(),
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/auth/session', () => ({ getValidAccessToken: vi.fn() }));

import { db } from '@/db';
import { READ_MODELS_SCHEMA } from '../../../../functions/src/corpTaxBookVersionKeys';
import { clearBookCache } from './bookCache';
import { mergeBookData, readBookData, readBookState, readRebills } from './bookClient';

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
  'readModels',
];
// The Overview and Miners tab docs (#5259), read with every book under their own stamp.
const MODELS = {
  minerList: { schema: READ_MODELS_SCHEMA, miners: [] },
  overview: { schema: READ_MODELS_SCHEMA },
};
const MODEL_DOCS = [`${BOOK}/readModels/minerList`, `${BOOK}/readModels/overview`];

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

beforeEach(async () => {
  clearBookCache();
  await db.corpBookObserved.clear();
  await db.corpBookObservedMeta.clear();
  await db.corpBookParts.clear();
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
  store.docs.set(MODEL_DOCS[0]!, MODELS.minerList);
  store.docs.set(MODEL_DOCS[1]!, MODELS.overview);
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

  it('after a reload, serves the Dexie copy of an unchanged stamp with no collection read', async () => {
    store.docs.set(`${BOOK}/observed/o1`, {
      date: '2026-10-02',
      typeId: 1,
      characterId: 1,
      updatedAt: { toMillis: () => 5 },
    });
    const first = await readBookData(7, CORP);
    clearBookCache();
    store.reads.length = 0;

    const again = await readBookData(7, CORP);

    expect(store.reads).not.toContain(`${BOOK}/observed`);
    expect(again?.observed).toEqual(first?.observed);
  });

  it('after a reload, reads the head doc and meta/paid only', async () => {
    const first = await readBookData(7, CORP);
    clearBookCache();
    store.reads.length = 0;

    const again = await readBookData(7, CORP);

    expect(store.reads).toEqual([BOOK, `${BOOK}/meta/paid`]);
    expect(again).toEqual(first);
  });

  it('after a reload, re-reads only the part whose stamp moved', async () => {
    await readBookData(7, CORP);
    clearBookCache();
    store.docs.set(`${BOOK}/statements/s2`, { id: 's2' });
    store.docs.set(BOOK, stamped({ statements: 'statements-2' }));
    store.reads.length = 0;

    const data = await readBookData(7, CORP);

    expect(store.reads.sort()).toEqual([BOOK, `${BOOK}/meta/paid`, `${BOOK}/statements`].sort());
    expect(data?.state.statements).toHaveLength(2);
  });

  it('after a reload, reads a part again once its copy is over a day old', async () => {
    await readBookData(7, CORP);
    clearBookCache();
    await db.corpBookParts.toCollection().modify({ at: Date.now() - 25 * 60 * 60 * 1000 });
    store.reads.length = 0;

    await readBookData(7, CORP);

    expect(store.reads).toContain(`${BOOK}/miners`);
  });

  it('reads only the core for a core-only plan, and never the ledger or the answers', async () => {
    const data = await readBookData(7, CORP, new Set(['core']));

    const read = new Set(store.reads);
    for (const c of ['miners', 'statements', 'extractions', 'observed', 'feeders'])
      expect(read).toContain(`${BOOK}/${c}`);
    for (const c of ['payments', 'dismissals', 'declarations', 'adjustments', 'writeOffs'])
      expect(read).not.toContain(`${BOOK}/${c}`);
    expect(read).not.toContain(`${BOOK}/meta/groupingAnswers`);
    expect(read).toContain(`${BOOK}/meta/paid`);
    expect(data?.parts).toEqual(new Set(['core']));
    expect(data?.state.paidStatementIds).toEqual(new Set(['s0']));
    expect(data?.state.statements).toHaveLength(1);
    expect(data?.state.payments).toEqual([]);
  });

  it('a later tab reads only the slice it adds, and the merge keeps the core', async () => {
    const core = await readBookData(7, CORP, new Set(['core']));
    store.reads.length = 0;
    store.docs.set(`${BOOK}/payments/p1`, { id: 'p1' });
    store.docs.set(BOOK, stamped({ payments: 'payments-2' }));

    const ledger = await readBookData(7, CORP, new Set(['ledger']));
    const merged = mergeBookData(core!, ledger!);

    expect(store.reads).not.toContain(`${BOOK}/miners`);
    expect(store.reads).not.toContain(`${BOOK}/observed`);
    expect(store.reads).toContain(`${BOOK}/payments`);
    expect(merged.parts).toEqual(new Set(['core', 'ledger']));
    expect(merged.state.miners).toEqual(core?.state.miners);
    expect(merged.observed).toEqual(core?.observed);
    expect(merged.state.payments).toHaveLength(1);
  });

  it('wipes every held part when the rules refuse the Character', async () => {
    await readBookData(7, CORP);
    expect(await db.corpBookParts.count()).toBeGreaterThan(0);
    clearBookCache();
    store.denied.add(`${BOOK}/meta/paid`);

    await expect(readBookData(7, CORP)).rejects.toMatchObject({ code: 'permission-denied' });
    await vi.waitFor(async () => expect(await db.corpBookParts.count()).toBe(0));
    expect(await db.corpBookObserved.count()).toBe(0);
  });

  it('does not save a part read that a wipe overtook', async () => {
    const { forgetObservedCopy } = await import('./observedStore');
    const first = readBookData(7, CORP);
    // The book is open (its stores made) once meta/paid is requested.
    await vi.waitFor(() => expect(store.reads).toContain(`${BOOK}/meta/paid`));
    await forgetObservedCopy(7, CORP);
    await first;

    expect(await db.corpBookParts.count()).toBe(0);
  });

  it('wipes the parts of a book that is gone', async () => {
    await readBookData(7, CORP);
    store.docs.delete(BOOK);

    expect(await readBookData(7, CORP)).toBeNull();
    expect(await db.corpBookParts.count()).toBe(0);
  });

  it('keeps one book at a time: opening another corporation drops the first', async () => {
    await readBookData(7, CORP);
    store.docs.set(`corps/${CORP + 1}`, stamped());
    store.docs.set(`corps/${CORP + 1}/meta/paid`, { ids: [] });

    await readBookData(7, CORP + 1);

    const held = await db.corpBookParts.toArray();
    expect(held.length).toBeGreaterThan(0);
    expect(new Set(held.map((r) => r.corporationId))).toEqual(new Set([CORP + 1]));
  });

  it('caches the rebills, so a second read costs the head doc and meta/paid', async () => {
    store.docs.set(BOOK, stamped({ rebills: 'rebills-1' }));
    store.docs.set(`${BOOK}/rebills/r1`, { minerId: 'm1', fromDate: '2026-10-01' });
    expect(await readRebills(7, CORP)).toEqual([
      { minerId: 'm1', fromDate: '2026-10-01', id: 'r1' },
    ]);
    store.reads.length = 0;

    await readRebills(7, CORP);

    expect(store.reads).toEqual([BOOK, `${BOOK}/meta/paid`]);
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

describe('readBookData and the Overview/Miners read models (#5259)', () => {
  it('reads the two docs, and reuses them while their stamp holds', async () => {
    const data = await readBookData(7, CORP);
    expect(data?.readModels).toEqual(MODELS);
    expect(store.reads.filter((p) => p.includes('/readModels')).sort()).toEqual(MODEL_DOCS);

    store.reads.length = 0;
    await readBookData(7, CORP);
    expect(store.reads.some((p) => p.includes('/readModels'))).toBe(false);

    store.docs.set(BOOK, stamped({ readModels: 'readModels-2' }));
    await readBookData(7, CORP);
    expect(store.reads.filter((p) => p.includes('/readModels')).sort()).toEqual(MODEL_DOCS);
  });

  it('opens the book without them while the server has not built them', async () => {
    store.docs.delete(MODEL_DOCS[0]!);
    store.docs.delete(MODEL_DOCS[1]!);
    const data = await readBookData(7, CORP);
    expect(data?.readModels).toEqual({ minerList: undefined, overview: undefined });
    expect(data?.state.miners).toHaveLength(1);
  });

  it('opens the book without them, wiping nothing, when the rules refuse the docs', async () => {
    await readBookData(7, CORP);
    clearBookCache();
    store.denied.add(MODEL_DOCS[0]!);
    store.denied.add(MODEL_DOCS[1]!);
    // A moved stamp, so the held copy is not served and the refused docs are read.
    store.docs.set(BOOK, stamped({ readModels: 'readModels-2' }));

    const data = await readBookData(7, CORP);
    expect(data?.readModels).toBeUndefined();
    expect(data?.state.miners).toBeDefined();
    expect(await db.corpBookParts.count()).toBeGreaterThan(0);
  });
});
