// The member side over the Corp Tax Book's version marker (issue #5050): what a
// reload — and so Settle up's 10-minute recheck — costs when nothing changed.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
interface Filter {
  field: string;
  op: string;
  value: unknown;
}
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
  denied: new Set<string>(),
  filters: [] as string[][],
}));
vi.mock('firebase/firestore/lite', () => {
  const read = (path: string) => {
    store.reads.push(path);
    if (store.denied.has(path))
      throw Object.assign(new Error('denied'), { code: 'permission-denied' });
  };
  return {
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    where: (field: string, op: string, value: unknown): Filter => ({ field, op, value }),
    query: (col: { path: string }, ...filters: Filter[]) => ({ path: col.path, filters }),
    getDoc: async (ref: { path: string }) => {
      read(ref.path);
      const data = store.docs.get(ref.path);
      return { exists: () => data !== undefined, data: () => data };
    },
    getDocs: async (ref: { path: string; filters?: Filter[] }) => {
      read(ref.path);
      store.filters.push((ref.filters ?? []).map((f) => f.field));
      const prefix = `${ref.path}/`;
      const docs = [...store.docs]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .filter(([, d]) =>
          (ref.filters ?? []).every((f) =>
            f.op === '=='
              ? d[f.field] === f.value
              : f.op === '>='
                ? typeof d[f.field] === 'number' &&
                  (d[f.field] as number) >= (f.value as Date).getTime()
                : (d[f.field] as unknown[]).includes(f.value)
          )
        )
        .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
      return { docs };
    },
  };
});
vi.mock('@/sync/firebaseApp', () => ({
  getSyncFirestore: () => ({}),
  getSyncFunctions: () => ({}),
}));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: async (id: number) => `char:${id}` }));
vi.mock('@/features/communities/pledgeWrites', () => ({
  underFirebaseSession: <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock('@/features/character/structures', () => ({ loadStructureName: async () => null }));

const { clearBookCache } = await import('@/features/corp/taxBook/bookCache');
const { loadCorpBooks } = await import('./corpBookStore');
const { db } = await import('@/db');
const { clearNotFound } = await import('@/sync/notFoundCache');

const CORP = 98000001;
const BOOK = `corps/${CORP}`;
const ME = 5;
const POINTER = `corpTaxBookBilledBy/char:${ME}`;
const COLLECTIONS = [
  'miners',
  'statements',
  'payments',
  'dismissals',
  'observed',
  'adjustments',
  'writeOffs',
  'feederCoverage',
];
const stamped = (overrides: Record<string, string> = {}): Data => ({
  active: true,
  startDate: '2026-10-01',
  bookVersion: 'b1',
  collectionVersions: {
    ...Object.fromEntries(COLLECTIONS.map((c) => [c, `${c}-1`])),
    ...overrides,
  },
});
const me = [{ characterId: ME, corporationId: CORP }];

beforeEach(async () => {
  clearBookCache();
  await db.settings.clear();
  await db.corpBookParts.clear();
  store.docs.clear();
  store.reads.length = 0;
  store.denied.clear();
  store.filters.length = 0;
  store.docs.set(BOOK, stamped());
  store.docs.set(POINTER, { books: { [CORP]: 1 } });
  store.docs.set(`${BOOK}/miners/solo:5`, { characterIds: [ME], uids: [`char:${ME}`] });
  store.docs.set(`${BOOK}/miners/solo:6`, { characterIds: [6], uids: ['char:6'] });
  store.docs.set(`${BOOK}/feederCoverage/98000002`, { coveragePeriods: [{ from: '2026-10-01' }] });
});

describe('loadCorpBooks over the version marker', () => {
  it('reloads an unchanged book for its pointer and settings document only', async () => {
    const [first] = await loadCorpBooks(me);
    store.reads.length = 0;

    const [again] = await loadCorpBooks(me);

    expect(store.reads).toEqual([POINTER, BOOK]);
    expect(again).toEqual(first);
    expect(again?.miners).toEqual([{ id: 'solo:5', characterIds: [ME], mainCharacterId: ME }]);
    expect(again?.feeders).toHaveLength(1);
  });

  it('skips the pointer and book reads while their misses are remembered', async () => {
    store.docs.delete(POINTER);
    store.docs.delete(BOOK);
    expect(await loadCorpBooks(me)).toEqual([]);
    store.reads.length = 0;

    expect(await loadCorpBooks(me)).toEqual([]);

    expect(store.reads).toEqual([]);
  });

  it('reads the book again once its miss is cleared', async () => {
    store.docs.delete(BOOK);
    await loadCorpBooks(me);
    store.docs.set(BOOK, stamped());
    await clearNotFound(BOOK);

    const [book] = await loadCorpBooks(me);

    expect(book?.corporationId).toBe(CORP);
  });

  it('re-reads only the part a write restamped', async () => {
    await loadCorpBooks(me);
    store.docs.set(`${BOOK}/miners/solo:5`, {
      characterIds: [ME, 7],
      uids: [`char:${ME}`, 'char:7'],
    });
    store.docs.set(BOOK, stamped({ miners: 'miners-2' }));
    store.reads.length = 0;

    const [book] = await loadCorpBooks(me);

    expect(store.reads).toEqual([POINTER, BOOK, `${BOOK}/miners`]);
    expect(book?.miners[0]?.characterIds).toEqual([ME, 7]);
  });

  it('stops reading feeder coverage once the pointer no longer names the book', async () => {
    // `feederCoverage` is the one part the rules gate on something outside the
    // book (the pointer), which no stamp tracks: the copy must not outlive it.
    await loadCorpBooks(me);
    store.docs.set(POINTER, { books: {} });
    store.reads.length = 0;

    const [book] = await loadCorpBooks(me);

    expect(book?.feeders).toBeUndefined();
  });

  it('reads feeder coverage live when the pointer could not be read', async () => {
    await loadCorpBooks(me);
    store.denied.add(POINTER);
    store.reads.length = 0;

    const [book] = await loadCorpBooks(me);

    // As before this change: the rules decide, never the copy.
    expect(store.reads).toContain(`${BOOK}/feederCoverage`);
    expect(book?.feeders).toHaveLength(1);
  });

  it('does not keep a part whose read failed', async () => {
    store.denied.add(`${BOOK}/adjustments`);
    await loadCorpBooks(me);
    store.denied.delete(`${BOOK}/adjustments`);
    store.reads.length = 0;

    await loadCorpBooks(me);

    expect(store.reads).toEqual([POINTER, BOOK, `${BOOK}/adjustments`]);
  });

  it('reads every part on every load while the server has not stamped the book', async () => {
    store.docs.set(BOOK, { active: true, startDate: '2026-10-01' });
    await loadCorpBooks(me);
    const count = store.reads.length;
    store.reads.length = 0;

    await loadCorpBooks(me);

    expect(store.reads).toHaveLength(count);
    expect(count).toBeGreaterThan(8);
  });

  it('keeps a member copy apart from another Character’s', async () => {
    await loadCorpBooks(me);
    store.reads.length = 0;

    await loadCorpBooks([{ characterId: 6, corporationId: CORP }]);

    expect(store.reads).toContain(`${BOOK}/miners`);
  });
});

describe('a member book on this device (#5243)', () => {
  const OBS = `${BOOK}/observed`;
  const row = (obsId: string, updatedAt?: number): Data => ({
    uid: `char:${ME}`,
    structureId: 1,
    characterId: ME,
    typeId: obsId.charCodeAt(0),
    quantity: 10,
    date: '2026-10-02',
    ...(updatedAt === undefined ? {} : { updatedAt }),
  });
  const NOW = Date.now();
  /** A page reload: the tab's memory is gone, Dexie is not. */
  const reload = () => clearBookCache();
  const obsIds = (b?: { observed: { oreLines: { typeId: number }[] }[] }) =>
    (b?.observed ?? []).flatMap((o) => o.oreLines.map((e) => String.fromCharCode(e.typeId))).sort();

  it('reads the pointer and settings document only after a reload with an unchanged book', async () => {
    store.docs.set(`${OBS}/a`, row('a', NOW - 1000));
    const [first] = await loadCorpBooks(me);
    reload();
    store.reads.length = 0;

    const [again] = await loadCorpBooks(me);

    expect(store.reads).toEqual([POINTER, BOOK]);
    expect(again).toEqual(first);
  });

  it('reads only own rows written since the watermark when the observed stamp moves', async () => {
    store.docs.set(`${OBS}/a`, row('a', NOW - 3_600_000));
    store.docs.set(`${OBS}/b`, row('b', NOW - 1000));
    await loadCorpBooks(me);
    reload();
    store.docs.set(`${OBS}/c`, row('c', NOW));
    store.docs.set(BOOK, stamped({ observed: 'observed-2' }));
    store.reads.length = 0;
    store.filters.length = 0;

    const [book] = await loadCorpBooks(me);

    expect(store.reads).toEqual([POINTER, BOOK, OBS]);
    expect(store.filters).toEqual([['uid', 'updatedAt']]);
    expect(obsIds(book)).toEqual(['a', 'b', 'c']);
  });

  it('reads all own rows when the held rows carry no updatedAt', async () => {
    store.docs.set(`${OBS}/a`, row('a'));
    await loadCorpBooks(me);
    reload();
    store.docs.set(`${OBS}/b`, row('b'));
    store.docs.set(BOOK, stamped({ observed: 'observed-2' }));
    store.filters.length = 0;

    const [book] = await loadCorpBooks(me);

    expect(store.filters).toEqual([['uid']]);
    expect(obsIds(book)).toEqual(['a', 'b']);
  });

  it('reads everything when the book was recreated', async () => {
    store.docs.set(BOOK, { ...stamped(), createdAt: 1 });
    store.docs.set(`${OBS}/a`, row('a', NOW - 1000));
    await loadCorpBooks(me);
    reload();
    store.docs.set(BOOK, { ...stamped(), createdAt: 2 });
    store.filters.length = 0;

    await loadCorpBooks(me);

    expect(store.filters).toEqual([['uid']]);
  });

  it('keeps no copy once the book is hidden from members', async () => {
    await loadCorpBooks(me);
    expect(await db.corpBookParts.count()).toBeGreaterThan(0);
    reload();
    store.docs.set(BOOK, { ...stamped(), active: false });
    await clearNotFound(BOOK);

    await loadCorpBooks(me);

    expect(await db.corpBookParts.count()).toBe(0);
  });

  it('wipes with the Character (removal)', async () => {
    await loadCorpBooks(me);
    const { clearObservedCopies } = await import('@/features/corp/taxBook/observedStore');

    await db.transaction(
      'rw',
      [db.corpBookObserved, db.corpBookObservedMeta, db.corpBookParts],
      () => clearObservedCopies(ME)
    );

    expect(await db.corpBookParts.count()).toBe(0);
  });

  it('does not drop a member copy when an officer opens a book', async () => {
    await loadCorpBooks(me);
    const { dropOtherBooks } = await import('@/features/corp/taxBook/observedStore');

    await dropOtherBooks(ME + 1, CORP);

    expect(await db.corpBookParts.count()).toBeGreaterThan(0);
  });

  it('keeps both books’ copies when a Character reads two of them', async () => {
    const OTHER = 98000002;
    store.docs.set(`corps/${OTHER}`, stamped());
    store.docs.set(`corps/${OTHER}/miners/solo:5`, { characterIds: [ME], uids: [`char:${ME}`] });
    const both = [
      { characterId: ME, corporationId: CORP },
      { characterId: ME, corporationId: OTHER },
    ];
    await loadCorpBooks(both);
    reload();
    store.reads.length = 0;

    await loadCorpBooks(both);

    expect(store.reads.filter((r) => r.includes('/miners'))).toEqual([]);
  });

  it('serves nothing from this tab once the book turns hidden', async () => {
    store.docs.set(`${OBS}/a`, row('a', NOW - 1000));
    await loadCorpBooks(me);
    store.docs.set(BOOK, { ...stamped(), active: false });
    await clearNotFound(BOOK);
    await loadCorpBooks(me);
    store.docs.set(BOOK, stamped());
    await clearNotFound(BOOK);
    store.reads.length = 0;

    await loadCorpBooks(me);

    expect(store.reads).toContain(OBS);
  });
});
