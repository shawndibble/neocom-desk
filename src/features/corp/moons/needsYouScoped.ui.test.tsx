// Needs you on a one-Miner page (#6206, #6207): a scoped read claims the core and the ledger, so
// the disputes and the uncounted donations it lists come from that read, not from nowhere.
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
type Filter = { field: string; op: string; value: unknown };
const store = vi.hoisted(() => new Map<string, Data>());
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: () => ({}),
  limit: () => ({}),
  query: (ref: { path: string }, ...parts: unknown[]) => ({ ...ref, parts }),
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  getDoc: async (ref: { path: string }) => {
    const data = store.get(ref.path);
    return { exists: () => data !== undefined, data: () => data };
  },
  getDocs: async (ref: { path: string; parts?: Filter[] }) => {
    const prefix = `${ref.path}/`;
    const docs = [...store]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .filter(([, data]) =>
        (ref.parts ?? []).every((p) => {
          if (p.op === '==') return data[p.field] === p.value;
          if (p.op === 'in') return (p.value as unknown[]).includes(data[p.field]);
          return true;
        })
      );
    return {
      docs: docs.map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data })),
    };
  },
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/auth/session', () => ({ getValidAccessToken: vi.fn() }));
// No Statement run is due: only the read's own items count.
vi.mock('@/engine/corpTaxBook/bookView', async (orig) => ({
  ...(await orig<typeof import('@/engine/corpTaxBook/bookView')>()),
  planStatementRuns: () => [],
}));

import { db } from '@/db';
import { clearBookCache } from '../taxBook/bookCache';
import { bookPartsFor, readBook, type BookRead } from '../taxBook/bookRead';
import { BookProvider } from './BookContext';
import type { BookContextValue } from './bookContextValue';
import { useNeedsYou } from './useNeedsYou';

const CORP = 98000001;
const BOOK = `corps/${CORP}`;

beforeEach(async () => {
  clearBookCache();
  await db.corpBookParts.clear();
  store.clear();
  store.set(BOOK, {
    active: true,
    startDate: '2026-08-01',
    bookVersion: 'b1',
    collectionVersions: { disputes: 'v1', meta: 'v1' },
  });
  store.set(`${BOOK}/meta/paid`, { ids: [] });
  store.set(`${BOOK}/miners/m1`, { id: 'm1', characterIds: [1], mainCharacterId: 1 });
  store.set(`${BOOK}/disputes/q1`, {
    id: 'q1',
    minerId: 'm1',
    date: '2026-09-12',
    lines: [{ recordKey: 'k', typeId: 1, quantity: 1, payeeName: 'Corp' }],
    by: 1,
    at: '2026-09-13T00:00:00Z',
  });
  // Division 3: the book reads division 1 only.
  store.set(`${BOOK}/meta/uncounted`, {
    donations: [
      { id: 'u1', refId: 1, division: 3, characterId: 1, amount: 5, at: '2026-09-13T00:00:00Z' },
    ],
  });
});

function needsYouOf(data: BookRead) {
  const value = {
    characterId: 7,
    corporationId: CORP,
    view: {
      input: {
        dismissals: data.state.dismissals,
        miners: [],
        notices: [],
        payments: [],
        now: '2026-09-18T00:00:00Z',
      },
      miners: [],
      needsYou: [],
      internals: { byMiner: new Map() },
    },
    names: {},
    settings: data.settings,
    data,
    verdict: { canEdit: true },
    reload: vi.fn(),
  } as unknown as Omit<BookContextValue, 'edit' | 'canEdit'>;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BookProvider value={value}>{children}</BookProvider>
  );
  return renderHook(() => useNeedsYou(), { wrapper }).result.current;
}

describe('Needs you on a one-Miner page', () => {
  it('lists the Miner’s dispute and the uncounted donation the scoped read holds', async () => {
    const read = await readBook(7, CORP, {
      parts: bookPartsFor('miners', 'miner'),
      minerId: 'm1',
    });
    const needs = needsYouOf(read!);
    expect(needs.disputes.map((d) => d.id)).toEqual(['q1']);
    expect(needs.uncounted.map((u) => u.id)).toEqual(['u1']);
    expect(needs.count).toBe(2);
  });
});
