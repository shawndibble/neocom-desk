// readMoonBookData (issue #5716): which documents a moon page reads, cold and warm.
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
      if (store.noIndex && range && parts.some((p) => p.op === '==' && p.field === 'structureId'))
        throw Object.assign(new Error('index'), { code: 'failed-precondition' });
      const prefix = `${ref.path}/`;
      let docs = [...store.docs]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .filter(([, data]) =>
          parts.every((p) => {
            if (p.op === '==') return data[p.field] === p.value;
            if (p.op === 'in') return (p.value as unknown[]).includes(data[p.field]);
            if (p.op === '>=') return (data[p.field] as string) >= (p.value as string);
            if (p.op === '<=') return (data[p.field] as string) <= (p.value as string);
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
import { readMoonBookData } from './bookClient';
import {
  BOOK_VERSION_FIELD,
  COLLECTION_VERSIONS_FIELD,
} from '../../../../functions/src/corpTaxBookVersionKeys';
import { MOON_DOC_SCHEMA } from '../../../../functions/src/corpTaxBookMoonDocs';
import { extractionId } from '@/engine/corpTaxBook/sync';

const CORP = 98000001;
const BOOK = `corps/${CORP}`;
const STRUCTURE = 1001;

const pull = (startDay: string, arriveDay: string, moonId = 31, structureId = STRUCTURE) => ({
  structureId,
  moonId,
  extractionStartTime: `${startDay}T00:00:00Z`,
  chunkArrivalTime: `${arriveDay}T00:00:00Z`,
  naturalDecayTime: `${arriveDay}T12:00:00Z`,
  laserFiredAt: `${arriveDay}T12:00:00Z`,
  oreLines: [{ typeId: 1, quantity: 1000 }],
});
const OLD = pull('2026-08-01', '2026-08-05'); // window 08-05 .. 08-07, billed
const NEW = pull('2026-09-10', '2026-09-17'); // window 09-17 .. 09-19, open
const ELSEWHERE = pull('2026-09-10', '2026-09-17', 77, 2002);
const ID = { old: extractionId(OLD), new: extractionId(NEW), else: extractionId(ELSEWHERE) };

const moonDoc = (id: string, structureId: number, minerIds: string[], schema = MOON_DOC_SCHEMA) =>
  store.docs.set(`${BOOK}/moonDocs/${id}`, {
    schema,
    extractionId: id,
    structureId,
    mined: [],
    minedPct: null,
    minerCount: minerIds.length,
    miners: minerIds.map((minerId) => ({ minerId, oreLines: [] })),
    frozenTax: 0,
    frozenLines: 0,
    updatedAt: { toMillis: () => 1 },
  });
const obs = (id: string, characterId: number, date: string, structureId = STRUCTURE) =>
  store.docs.set(`${BOOK}/observed/${id}`, {
    characterId,
    date,
    typeId: 1,
    quantity: 10,
    structureId,
    recordedCorporationId: CORP,
    cachedAt: `${date}T00:00:00Z`,
  });
const reads = (collectionName: string) =>
  store.reads.filter((p) => p.startsWith(`${BOOK}/${collectionName}/`)).sort();

beforeEach(async () => {
  clearBookCache();
  await db.corpBookParts.clear();
  store.docs.clear();
  store.reads.length = 0;
  store.noIndex = false;
  store.docs.set(BOOK, {
    active: true,
    startDate: '2026-08-01',
    [BOOK_VERSION_FIELD]: 'b1',
    [COLLECTION_VERSIONS_FIELD]: {
      miners: 'v1',
      statements: 'v1',
      extractions: 'v1',
      payments: 'v1',
      dismissals: 'v1',
      declarations: 'v1',
      adjustments: 'v1',
      writeOffs: 'v1',
      feeders: 'v1',
      meta: 'v1',
      moonDocs: 'v1',
    },
  });
  store.docs.set(`${BOOK}/meta/paid`, { ids: [] });
  for (const [i, x] of [OLD, NEW, ELSEWHERE].entries())
    store.docs.set(`${BOOK}/extractions/e${i}`, x);
  // Miner 1 was billed through August; miner 2 never was.
  store.docs.set(`${BOOK}/statements/s1`, {
    id: 's1',
    minerId: 'solo:1',
    coversFrom: '2026-08-01',
    coversThrough: '2026-08-31',
    issuedAt: '2026-09-02T00:00:00Z',
    lines: [],
  });
  moonDoc(ID.old, STRUCTURE, ['solo:1']);
  moonDoc(ID.new, STRUCTURE, ['solo:1', 'solo:2']);
  moonDoc(ID.else, 2002, ['solo:1']);
  obs('a', 1, '2026-08-05'); // the billed cycle's window
  obs('b', 1, '2026-09-17');
  obs('c', 2, '2026-09-18');
  obs('d', 1, '2026-09-25'); // after the window
  obs('e', 1, '2026-09-18', 2002); // another refinery, same days
  obs('f', 1, '2026-08-20'); // between the cycles
});

describe('readMoonBookData', () => {
  it('reads the shown pull window and its moon docs, not the ledger', async () => {
    const read = await readMoonBookData(7, CORP, ID.new);
    if (read === 'fallback' || read === null) throw new Error('expected a scoped read');
    expect(read.data.observed.map((r) => `${r.characterId}:${r.date}`).sort()).toEqual([
      '1:2026-09-17',
      '2:2026-09-18',
    ]);
    // The billed cycle prints its doc: no row of its window is read.
    expect([...read.fromDocs]).toEqual([ID.old]);
    expect(reads('observed')).toEqual([`${BOOK}/observed/b`, `${BOOK}/observed/c`]);
    // This refinery's two docs; the other refinery's is not read.
    expect(reads('moonDocs')).toEqual(
      [`${BOOK}/moonDocs/${ID.new}`, `${BOOK}/moonDocs/${ID.old}`].sort()
    );
    expect(read.data.parts).toEqual(new Set(['core', 'ledger']));
  });

  it('warm: the docs and records come from this tab, only the window rows are read', async () => {
    await readMoonBookData(7, CORP, ID.new);
    store.reads.length = 0;
    const read = await readMoonBookData(7, CORP, ID.new);
    expect(read).not.toBe('fallback');
    expect(reads('moonDocs')).toEqual([]);
    expect(reads('statements')).toEqual([]);
    expect(reads('observed')).toEqual([`${BOOK}/observed/b`, `${BOOK}/observed/c`]);
  });

  it('reads a cycle whose Miner can still have an open day', async () => {
    moonDoc(ID.old, STRUCTURE, ['solo:1', 'solo:2']);
    const read = await readMoonBookData(7, CORP, ID.new);
    if (read === 'fallback' || read === null) throw new Error('expected a scoped read');
    expect([...read.fromDocs]).toEqual([]);
    expect(read.data.observed.map((r) => r.date).sort()).toEqual([
      '2026-08-05',
      '2026-09-17',
      '2026-09-18',
    ]);
  });

  it('survives a missing composite index by filtering the window here', async () => {
    store.noIndex = true;
    const read = await readMoonBookData(7, CORP, ID.new);
    if (read === 'fallback' || read === null) throw new Error('expected a scoped read');
    expect(read.data.observed.map((r) => `${r.characterId}:${r.date}`).sort()).toEqual([
      '1:2026-09-17',
      '2:2026-09-18',
    ]);
  });

  it('falls back to the whole book when a doc is missing', async () => {
    store.docs.delete(`${BOOK}/moonDocs/${ID.new}`);
    expect(await readMoonBookData(7, CORP, ID.new)).toBe('fallback');
    expect(reads('observed')).toEqual([]);
  });

  it('falls back when a doc is on another schema', async () => {
    moonDoc(ID.old, STRUCTURE, ['solo:1'], MOON_DOC_SCHEMA + 1);
    expect(await readMoonBookData(7, CORP, ID.new)).toBe('fallback');
  });

  it('reads no row for a pull the book does not have', async () => {
    const read = await readMoonBookData(7, CORP, 'nope');
    if (read === 'fallback' || read === null) throw new Error('expected a scoped read');
    expect(read.data.observed).toEqual([]);
    expect(reads('observed')).toEqual([]);
  });
});
