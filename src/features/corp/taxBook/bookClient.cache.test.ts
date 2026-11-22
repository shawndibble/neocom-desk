// readBook / readBookState over the version marker (issue #5047): what
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
import { bookPartsFor, extendBook, readBook } from './bookRead';
import { readBookState, readRebills } from './bookClient';

/** The whole book, as the export reads it. */
const WHOLE = { parts: bookPartsFor() };

const CORP = 98000001;
const BOOK = `corps/${CORP}`;
/** A stored observed row as the server writes it (every field `readObservedRow` requires). */
const OBSERVED_ROW = {
  structureId: 1001,
  characterId: 1,
  recordedCorporationId: CORP,
  typeId: 1,
  date: '2026-10-02',
  quantity: 10,
  cachedAt: '2026-10-02T12:00:00Z',
};
const COLLECTIONS = [
  'miners',
  'lateNotices',
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
  store.docs.set(`${BOOK}/lateNotices/s1`, notice('s1'));
  store.docs.set(`${BOOK}/observed/o1`, { ...OBSERVED_ROW });
  store.docs.set(`${BOOK}/feeders/5`, { corporationId: 5, status: 'active' });
  store.docs.set(`${BOOK}/feeders/5/payouts/p1`, { amount: 1 });
  store.docs.set(`${BOOK}/meta/paid`, { ids: ['s0'] });
  store.docs.set(MODEL_DOCS[0]!, MODELS.minerList);
  store.docs.set(MODEL_DOCS[1]!, MODELS.overview);
});

/** A late notice as the server stores it. */
function notice(id: string) {
  return {
    id,
    minerId: 'solo:1',
    issuedAt: '2026-09-01T00:00:00Z',
    lines: [],
    mail: { sent: 1, manualSent: 0, remindersStopped: false },
  };
}

describe('readBook over the version marker', () => {
  it('re-opens an unchanged book for its settings document and the officer-only probe', async () => {
    const first = await readBook(7, CORP, WHOLE);
    store.reads.length = 0;

    const again = await readBook(7, CORP, WHOLE);

    expect(store.reads).toEqual([BOOK, `${BOOK}/meta/paid`]);
    expect(again).toEqual(first);
    expect(again?.feeders?.[0]?.payouts).toEqual([{ amount: 1, id: 'p1' }]);
  });

  it('reads disputes only once a write stamped them, then from the copy (#6206)', async () => {
    const before = await readBook(7, CORP, WHOLE);
    expect(store.reads).not.toContain(`${BOOK}/disputes`);
    expect(before?.disputes).toEqual([]);
    clearBookCache();
    store.reads.length = 0;
    store.docs.set(BOOK, stamped({ disputes: 'disputes-1' }));
    store.docs.set(`${BOOK}/disputes/d1`, {
      id: 'd1',
      minerId: 'm1',
      date: '2026-10-02',
      lines: [{ recordKey: '1:1000:2026-10-02', typeId: 1, quantity: 5, payeeName: 'P' }],
      by: 1,
      at: '2026-10-03T00:00:00.000Z',
    });
    const after = await readBook(7, CORP, WHOLE);
    expect(store.reads).toContain(`${BOOK}/disputes`);
    expect(after?.disputes?.map((d) => d.id)).toEqual(['d1']);
    store.reads.length = 0;
    await readBook(7, CORP, WHOLE);
    expect(store.reads).not.toContain(`${BOOK}/disputes`);
  });

  it('after a reload, serves the Dexie copy of an unchanged stamp with no collection read', async () => {
    store.docs.set(`${BOOK}/observed/o1`, {
      ...OBSERVED_ROW,
      updatedAt: { toMillis: () => 5 },
    });
    const first = await readBook(7, CORP, WHOLE);
    clearBookCache();
    store.reads.length = 0;

    const again = await readBook(7, CORP, WHOLE);

    expect(store.reads).not.toContain(`${BOOK}/observed`);
    expect(again?.observed).toEqual(first?.observed);
  });

  it('after a reload, reads the head doc and meta/paid only', async () => {
    const first = await readBook(7, CORP, WHOLE);
    clearBookCache();
    store.reads.length = 0;

    const again = await readBook(7, CORP, WHOLE);

    expect(store.reads).toEqual([BOOK, `${BOOK}/meta/paid`]);
    expect(again).toEqual(first);
  });

  it('after a reload, re-reads only the part whose stamp moved', async () => {
    await readBook(7, CORP, WHOLE);
    clearBookCache();
    store.docs.set(`${BOOK}/lateNotices/s2`, notice('s2'));
    store.docs.set(BOOK, stamped({ lateNotices: 'lateNotices-2' }));
    store.reads.length = 0;

    const data = await readBook(7, CORP, WHOLE);

    expect(store.reads.sort()).toEqual([BOOK, `${BOOK}/meta/paid`, `${BOOK}/lateNotices`].sort());
    expect(data?.state.notices).toHaveLength(2);
  });

  it('after a reload, reads a part again once its copy is over a day old', async () => {
    await readBook(7, CORP, WHOLE);
    clearBookCache();
    await db.corpBookParts.toCollection().modify({ at: Date.now() - 25 * 60 * 60 * 1000 });
    store.reads.length = 0;

    await readBook(7, CORP, WHOLE);

    expect(store.reads).toContain(`${BOOK}/miners`);
  });

  it('reads only the core for a core-only plan, and never the ledger or the answers', async () => {
    const data = await readBook(7, CORP, { parts: new Set(['core']) });

    const read = new Set(store.reads);
    for (const c of ['miners', 'lateNotices', 'extractions', 'feeders'])
      expect(read).toContain(`${BOOK}/${c}`);
    // The ledger rows are a part of their own (#5717).
    for (const c of [
      'observed',
      'payments',
      'dismissals',
      'declarations',
      'adjustments',
      'writeOffs',
    ])
      expect(read).not.toContain(`${BOOK}/${c}`);
    expect(read).not.toContain(`${BOOK}/meta/groupingAnswers`);
    expect(read).toContain(`${BOOK}/meta/paid`);
    expect(data?.parts).toEqual(new Set(['core']));
    expect(data?.state.notices).toHaveLength(1);
    expect(data?.state.payments).toEqual([]);
  });

  it('the Moon owners plan reads each owner summary and no ledger row (#5717)', async () => {
    store.docs.set(`${BOOK}/feederViews/5`, { schemaVersion: 1 });
    const data = await readBook(7, CORP, { parts: bookPartsFor('moon-owners', null) });

    expect(store.reads.filter((r) => r.startsWith(`${BOOK}/observed`))).toEqual([]);
    expect(store.reads).toContain(`${BOOK}/feederViews/5`);
    expect(data?.observed).toEqual([]);
    expect(data?.feederSummaries?.get(5)).toEqual({ schemaVersion: 1 });
  });

  it('a later tab that needs the rows reads only them, and the merge keeps the rest', async () => {
    const owners = await readBook(7, CORP, { parts: bookPartsFor('moon-owners', null) });
    store.reads.length = 0;

    const merged = await extendBook(7, CORP, owners!, new Set(['core', 'owners', 'observed']));

    expect(store.reads).toContain(`${BOOK}/observed`);
    expect(store.reads).not.toContain(`${BOOK}/miners`);
    expect(merged.observed).toHaveLength(1);
    expect(merged.state.miners).toEqual(owners?.state.miners);
    expect(merged.feederSummaries).toEqual(owners?.feederSummaries);
    expect(merged.parts).toEqual(new Set(['core', 'owners', 'observed']));
  });

  it('reads nothing when the held parts cover the tab', async () => {
    const held = await readBook(7, CORP, { parts: new Set(['core', 'observed', 'ledger']) });
    store.reads.length = 0;
    expect(await extendBook(7, CORP, held!, bookPartsFor('extractions', null))).toBe(held);
    expect(store.reads).toEqual([]);
  });

  it('keeps the settings the held read was priced with', async () => {
    const held = await readBook(7, CORP, { parts: new Set(['core']) });
    store.docs.set(BOOK, { ...stamped(), graceHours: 99 });
    const merged = await extendBook(7, CORP, held!, new Set(['core', 'ledger']));
    expect(merged.settings).toBe(held!.settings);
    expect(merged.state.book).toBe(held!.settings);
  });

  it('a warm Overview opens as it did before the split: the head doc and meta/paid only', async () => {
    const wanted = bookPartsFor('overview', null);
    await readBook(7, CORP, { parts: wanted });
    store.reads.length = 0;

    await readBook(7, CORP, { parts: wanted });

    expect(store.reads).toEqual([BOOK, `${BOOK}/meta/paid`]);
  });

  it('a later tab reads only the slice it adds, and the merge keeps the core', async () => {
    const core = await readBook(7, CORP, { parts: new Set(['core', 'observed']) });
    store.reads.length = 0;
    store.docs.set(`${BOOK}/payments/p1`, { id: 'p1' });
    store.docs.set(BOOK, stamped({ payments: 'payments-2' }));

    const merged = await extendBook(7, CORP, core!, bookPartsFor('late-notices', null));

    expect(store.reads).not.toContain(`${BOOK}/miners`);
    expect(store.reads).not.toContain(`${BOOK}/observed`);
    expect(store.reads).toContain(`${BOOK}/payments`);
    expect(merged.parts).toEqual(new Set(['core', 'observed', 'ledger']));
    expect(merged.state.miners).toEqual(core?.state.miners);
    expect(merged.observed).toEqual(core?.observed);
    expect(merged.state.payments).toHaveLength(1);
  });

  it('wipes every held part when the rules refuse the Character', async () => {
    await readBook(7, CORP, WHOLE);
    expect(await db.corpBookParts.count()).toBeGreaterThan(0);
    clearBookCache();
    store.denied.add(`${BOOK}/meta/paid`);

    await expect(readBook(7, CORP, WHOLE)).rejects.toMatchObject({ code: 'permission-denied' });
    await vi.waitFor(async () => expect(await db.corpBookParts.count()).toBe(0));
    expect(await db.corpBookObserved.count()).toBe(0);
  });

  it('does not save a part read that a wipe overtook', async () => {
    const { forgetObservedCopy } = await import('./observedStore');
    const first = readBook(7, CORP, WHOLE);
    // The book is open (its stores made) once meta/paid is requested.
    await vi.waitFor(() => expect(store.reads).toContain(`${BOOK}/meta/paid`));
    await forgetObservedCopy(7, CORP);
    await first;

    expect(await db.corpBookParts.count()).toBe(0);
  });

  it('wipes the parts of a book that is gone', async () => {
    await readBook(7, CORP, WHOLE);
    store.docs.delete(BOOK);

    expect(await readBook(7, CORP, WHOLE)).toBeNull();
    expect(await db.corpBookParts.count()).toBe(0);
  });

  it('keeps one book at a time: opening another corporation drops the first', async () => {
    await readBook(7, CORP, WHOLE);
    store.docs.set(`corps/${CORP + 1}`, stamped());
    store.docs.set(`corps/${CORP + 1}/meta/paid`, { ids: [] });

    await readBook(7, CORP + 1, WHOLE);

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
    await readBook(7, CORP, WHOLE);
    store.docs.set(`${BOOK}/lateNotices/s2`, notice('s2'));
    store.docs.set(BOOK, stamped({ lateNotices: 'lateNotices-2' }));
    store.reads.length = 0;

    const data = await readBook(7, CORP, WHOLE);

    expect(store.reads.sort()).toEqual([BOOK, `${BOOK}/meta/paid`, `${BOOK}/lateNotices`].sort());
    expect(data?.state.notices.map((n) => n.id)).toEqual(['s1', 's2']);
  });

  it('re-reads a feeder and its payouts when the feeders stamp moves', async () => {
    await readBook(7, CORP, WHOLE);
    store.docs.set(`${BOOK}/feeders/5/payouts/p2`, { amount: 2 });
    store.docs.set(BOOK, stamped({ feeders: 'feeders-2' }));
    store.reads.length = 0;

    const data = await readBook(7, CORP, WHOLE);

    expect(store.reads).toContain(`${BOOK}/feeders/5/payouts`);
    expect(data?.feeders?.[0]?.payouts).toHaveLength(2);
  });

  it('reads everything on every open while the server has not stamped the book', async () => {
    store.docs.set(BOOK, { active: true, startDate: '2026-10-01' });
    await readBook(7, CORP, WHOLE);
    const firstCount = store.reads.length;
    store.reads.length = 0;

    await readBook(7, CORP, WHOLE);

    expect(store.reads).toHaveLength(firstCount);
    expect(firstCount).toBeGreaterThan(10);
  });

  it('shares the copy with readBookState, so a sync re-reads only what it changed', async () => {
    await readBook(7, CORP, WHOLE);
    store.reads.length = 0;

    const state = await readBookState(7, CORP);

    // The disputes are the sync's own read (an open one holds its Statement); the page's copy
    // above never read them.
    expect(store.reads).toEqual([BOOK, `${BOOK}/meta/paid`, `${BOOK}/disputes`]);
    expect(state?.notices.map((n) => n.id)).toEqual(['s1']);
  });

  it('serves no copy to a Character the rules now refuse', async () => {
    await readBook(7, CORP, WHOLE);
    store.denied.add(`${BOOK}/meta/paid`);

    await expect(readBook(7, CORP, WHOLE)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('is null, reading nothing else, when the corporation has no book', async () => {
    store.docs.delete(BOOK);
    expect(await readBook(7, CORP, WHOLE)).toBeNull();
    expect(store.reads).toEqual([BOOK]);
  });
});

describe('readBook and the moon owner summaries (#5717)', () => {
  const VIEW = `${BOOK}/feederViews/5`;
  beforeEach(() => {
    store.docs.set(`${BOOK}/feeders/6`, { corporationId: 6, status: 'active' });
    store.docs.set(VIEW, { schemaVersion: 1, minedValueIsk: 10 });
  });
  const feederViewReads = () => store.reads.filter((p) => p.includes('/feederViews'));

  it('reads one summary doc per moon owner with the owners part, and nothing under it', async () => {
    const data = await readBook(7, CORP, { parts: new Set(['core', 'owners']) });
    expect(feederViewReads()).toEqual([VIEW, `${BOOK}/feederViews/6`]);
    expect([...data!.feederSummaries!.keys()]).toEqual([5]);
    expect(data!.feederSummaries!.get(5)).toMatchObject({ minedValueIsk: 10 });
  });

  it('reads none without it: the other tabs and the whole-book export', async () => {
    expect(
      (await readBook(7, CORP, { parts: new Set(['core']) }))!.feederSummaries
    ).toBeUndefined();
    expect((await readBook(7, CORP, WHOLE))!.feederSummaries).toBeUndefined();
    expect(feederViewReads()).toEqual([]);
  });

  it('leaves out a summary the rules refuse, so that moon owner is priced from its rows', async () => {
    store.denied.add(VIEW);
    const data = await readBook(7, CORP, { parts: new Set(['core', 'owners']) });
    expect(data!.feederSummaries!.size).toBe(0);
  });

  it('reads the owners part alone from the held record list, then merges it', async () => {
    const held = await readBook(7, CORP, { parts: new Set(['core']) });
    store.reads.length = 0;
    const merged = await extendBook(7, CORP, held!, new Set(['core', 'owners']));
    // The record list came from this tab's copy: no feeders collection read, only the summaries.
    expect(store.reads.filter((p) => p.includes('/feeders'))).toEqual([]);
    expect(feederViewReads()).toEqual([VIEW, `${BOOK}/feederViews/6`]);
    expect(merged.parts).toEqual(new Set(['core', 'owners']));
    expect(merged.feederSummaries?.get(5)).toBeDefined();
    expect(merged.observed).toEqual(held!.observed);
  });

  it('reads no ledger row for the moon owner summaries', async () => {
    store.reads.length = 0;
    await readBook(7, CORP, { parts: new Set(['owners']) });
    expect(store.reads.filter((p) => p.startsWith(`${BOOK}/observed`))).toEqual([]);
  });
});
