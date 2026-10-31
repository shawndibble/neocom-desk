// Firestore document reads of the officer ledger (`observed`): the Dexie delta against a
// windowed open-days query, cold and warm (issue #5718). The windowed arm is a modelled
// `date >= from` query over a fixture, not production code: it prices the alternative. Documents the measurement that
// kept the delta: a window cannot ride the copy, so it re-reads every open row on every open.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
type Filter = { field: string; op: string; value: unknown };
const store = vi.hoisted(() => ({ docs: new Map<string, Data>(), docReads: 0 }));
const ms = (v: unknown) => (v as { toMillis?: () => number })?.toMillis?.() ?? (v as number);
vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/'), filters: [] }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (ref: { path: string }, ...filters: Filter[]) => ({ ...ref, filters }),
  Timestamp: { fromMillis: (n: number) => ({ toMillis: () => n }) },
  getDocs: async (ref: { path: string; filters: Filter[] }) => {
    const prefix = `${ref.path}/`;
    const docs = [...store.docs]
      .filter(([path]) => path.startsWith(prefix))
      .filter(([, d]) =>
        ref.filters.every((f) =>
          f.field === 'updatedAt'
            ? ms(d.updatedAt ?? -1) >= ms(f.value)
            : (d[f.field] as string) >= (f.value as string)
        )
      )
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
    store.docReads += docs.length; // Firestore bills one read per returned document
    return { docs };
  },
}));

import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import { db } from '@/db';
import { readObservedRows } from './observedRead';

const CORP = 98000001;
const PATH = `corps/${CORP}/observed`;
const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
const DAYS = 30;
const PER_DAY = 10;
const OPEN_DAYS = 7;
const ok = Promise.resolve();
const dateOf = (i: number) => new Date(T0 - (DAYS - 1 - i) * DAY).toISOString().slice(0, 10);

const open = (version: string, now: number) =>
  readObservedRows({} as never, 7, CORP, version, ok, now);
/** The windowed alternative: every row since the oldest open day, no copy to reuse. */
const windowed = () =>
  getDocs(
    query(
      collection({} as never, 'corps', String(CORP), 'observed'),
      where('date', '>=', dateOf(DAYS - OPEN_DAYS))
    )
  );
const reads = async (work: () => Promise<unknown>) => {
  store.docReads = 0;
  await work();
  return store.docReads;
};

beforeEach(async () => {
  store.docs.clear();
  await db.corpBookObserved.clear();
  await db.corpBookObservedMeta.clear();
  await db.corpBookParts.clear();
  for (let d = 0; d < DAYS; d++)
    for (let r = 0; r < PER_DAY; r++)
      store.docs.set(`${PATH}/o${d}_${r}`, {
        date: dateOf(d),
        quantity: 1,
        updatedAt: { toMillis: () => T0 - (DAYS - d) * DAY },
      });
});

describe('observed read cost, delta vs windowed open days', () => {
  it('cold: the window reads the open rows, the full read reads the ledger', async () => {
    const full = await reads(() => open('v1', T0));
    const win = await reads(windowed);
    expect(full).toBe(DAYS * PER_DAY);
    expect(win).toBe(OPEN_DAYS * PER_DAY);
  });

  it('warm, nothing changed: the copy reads zero, the window reads every open row again', async () => {
    await open('v1', T0);
    const copy = await reads(() => open('v1', T0 + 60_000));
    const win = await reads(windowed);
    expect(copy).toBe(0);
    expect(win).toBe(OPEN_DAYS * PER_DAY);
  });

  it('warm, a sync changed a few rows: the delta reads those, the window the whole open set', async () => {
    await open('v1', T0);
    const changedAt = T0 + 60 * 60_000;
    for (let r = 0; r < 5; r++)
      store.docs.set(`${PATH}/o${DAYS - 1}_${r}`, {
        date: dateOf(DAYS - 1),
        quantity: 2,
        updatedAt: { toMillis: () => changedAt },
      });
    const delta = await reads(() => open('v2', changedAt + 60_000));
    const win = await reads(windowed);
    // The 5 changed rows plus the newest day's other 5, stamped at the watermark, which the overlap query (>=) re-reads.
    expect(delta).toBe(10);
    expect(win).toBeGreaterThan(delta);
  });
});
