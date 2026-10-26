import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { AlertGrantDoc } from './alertGrant.js';
import { encryptRefreshToken } from './alertGrantCrypto.js';
import { DUE_PAGE_SIZE, firestorePollerStore } from './alertGrantStore.js';
import { POLL_RUN_MS } from './pollerEfficiency.js';
import { ALERTS_POLL_STATS_KEYS, createRunStats } from './runStats.js';

const KEY = randomBytes(32);
const NOW = 10 * POLL_RUN_MS;
/** The run of the day that lists every active grant. */
const FULL_LISTING_NOW = 12 * POLL_RUN_MS;

const grant = (id: number, over: Partial<AlertGrantDoc> = {}): AlertGrantDoc => ({
  encryptedRefreshToken: encryptRefreshToken(`rt-${id}`, id, KEY),
  clientId: 'client',
  enabledAt: 1,
  highWaterId: null,
  etag: null,
  seenTypes: [],
  status: 'active',
  nextPollAt: 0,
  ...over,
});

/** `alertGrants/{id}` in memory, counting the plain document reads the poller pays for. */
function fakeDb(initial: Record<number, AlertGrantDoc>) {
  const docs = new Map<string, AlertGrantDoc>(
    Object.entries(initial).map(([id, d]) => [id, d] as const)
  );
  const reads = { docGets: 0, queryPages: 0 };
  const snap = (id: string) => ({
    id,
    exists: docs.has(id),
    data: () => docs.get(id),
    ref: { update: async (patch: Partial<AlertGrantDoc>) => void apply(id, patch) },
  });
  const apply = (id: string, patch: Partial<AlertGrantDoc>) =>
    docs.set(id, { ...docs.get(id)!, ...patch });
  const ref = (id: string) => ({
    id,
    get: async () => {
      reads.docGets += 1;
      return snap(id);
    },
    update: async (patch: Partial<AlertGrantDoc>) => void apply(id, patch),
  });
  type Filter = { field: string; op: string; value: unknown };
  const query = (filters: Filter[], after: string | null, max: number): unknown => ({
    where: (field: string, op: string, value: unknown) =>
      query([...filters, { field, op, value }], after, max),
    orderBy: () => query(filters, after, max),
    limit: (n: number) => query(filters, after, n),
    startAfter: (d: { id: string }) => query(filters, d.id, max),
    get: async () => {
      reads.queryPages += 1;
      const rows = [...docs.entries()]
        .filter(([, d]) =>
          filters.every(({ field, op, value }) => {
            const v = (d as unknown as Record<string, unknown>)[field];
            // Like Firestore, an inequality never matches a document without the field.
            return op === '==' ? v === value : typeof v === 'number' && v <= (value as number);
          })
        )
        .sort(([ia, a], [ib, b]) => (a.nextPollAt ?? 0) - (b.nextPollAt ?? 0) || +ia - +ib);
      const from = after === null ? 0 : rows.findIndex(([id]) => id === after) + 1;
      return { docs: rows.slice(from, from + max).map(([id]) => snap(id)) };
    },
  });
  const db = {
    collection: () => ({
      doc: (id: string) => ref(id),
      where: (field: string, op: string, value: unknown) =>
        query([{ field, op, value }], null, Infinity),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (r: { id: string }) => snap(r.id),
        update: (r: { id: string }, patch: Partial<AlertGrantDoc>) =>
          void docs.set(r.id, { ...docs.get(r.id)!, ...patch }),
      }),
  } as unknown as Firestore;
  return { db, docs, reads };
}

describe('firestorePollerStore', () => {
  it('refreshes from the grant listDue already read: no second read per Character', async () => {
    const f = fakeDb({ 1: grant(1), 2: grant(2), 3: grant(3, { status: 'revoked' }) });
    const refresh = vi.fn(async (_c: string, rt: string) => ({
      accessToken: `at-${rt}`,
      refreshToken: rt,
    }));
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh });
    expect((await store.listDue(NOW)).map((l) => l.characterId)).toEqual([1, 2]);
    expect(await store.refresh(1)).toMatchObject({ kind: 'ok', accessToken: 'at-rt-1' });
    expect(await store.refresh(2)).toMatchObject({ kind: 'ok', accessToken: 'at-rt-2' });
    expect(f.reads.docGets).toBe(0);
    expect(refresh).toHaveBeenCalledWith('client', 'rt-1');
  });

  it('reads the grant itself for a Character listDue did not return', async () => {
    const f = fakeDb({ 1: grant(1) });
    const refresh = async (_c: string, rt: string) => ({ accessToken: 'at', refreshToken: rt });
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh });
    expect(await store.refresh(1)).toMatchObject({ kind: 'ok' });
    expect(f.reads.docGets).toBe(1);
  });

  it('a re-grant between the listing and the rotated write still discards the rotated token', async () => {
    const f = fakeDb({ 1: grant(1) });
    const regrant = grant(1);
    const refresh = async () => {
      f.docs.set('1', regrant);
      return { accessToken: 'at', refreshToken: 'rt-rotated' };
    };
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh });
    await store.listDue(NOW);
    expect(await store.refresh(1)).toEqual({ kind: 'skip' });
    expect(f.docs.get('1')).toBe(regrant);
  });

  it('counts its reads and writes, and the rotated-token write apart', async () => {
    const f = fakeDb({ 1: grant(1), 2: grant(2) });
    const refresh = vi.fn(async (_c: string, rt: string) => ({
      accessToken: 'at',
      refreshToken: rt === 'rt-1' ? 'rt-1-rotated' : rt,
    }));
    const stats = createRunStats(ALERTS_POLL_STATS_KEYS);
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh, stats });
    await store.listDue(NOW);
    await store.refresh(1); // SSO answered a different token: one write
    await store.refresh(2); // same token: no write
    expect(stats.snapshot()).toMatchObject({
      ssoRefreshCalls: 2,
      tokenRotationWrites: 1,
      firestoreWrites: 1,
      firestoreReads: 2 + 1, // the listing's two documents, the one transaction read
    });
  });

  it('marks a grant idle and forgets its mail mark, guarded on the token', async () => {
    const f = fakeDb({ 1: grant(1, { mailHighWaterId: 5, mailEtag: '"m"' }) });
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh: vi.fn() });
    const blob = f.docs.get('1')!.encryptedRefreshToken;
    await store.markIdle(1, 'stale-blob', { notifications: true, clearMail: true });
    expect(f.docs.get('1')!.notificationsIdle).toBeUndefined();
    await store.markIdle(1, blob, { notifications: true, clearMail: true });
    expect(f.docs.get('1')).toMatchObject({
      notificationsIdle: true,
      mailHighWaterId: null,
      mailEtag: null,
      mailPushed: [],
    });
  });

  it('lists only the grants due now', async () => {
    const f = fakeDb({
      1: grant(1, { nextPollAt: NOW }),
      2: grant(2, { nextPollAt: NOW + 1 }),
      3: grant(3, { nextPollAt: 0 }),
      4: grant(4, { nextPollAt: 0, status: 'revoked' }),
    });
    const stats = createRunStats(ALERTS_POLL_STATS_KEYS);
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh: vi.fn(), stats });
    expect((await store.listDue(NOW)).map((l) => l.characterId)).toEqual([3, 1]);
    expect(stats.snapshot().firestoreReads).toBe(2);
  });

  it('pages through more due grants than one page holds', async () => {
    const many = Object.fromEntries(
      Array.from({ length: DUE_PAGE_SIZE + 5 }, (_, i) => [i + 1, grant(i + 1)])
    );
    const f = fakeDb(many);
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh: vi.fn() });
    expect(await store.listDue(NOW)).toHaveLength(DUE_PAGE_SIZE + 5);
    expect(f.reads.queryPages).toBe(2);
  });

  it('an exact page ends on one more empty page', async () => {
    const full = Object.fromEntries(
      Array.from({ length: DUE_PAGE_SIZE }, (_, i) => [i + 1, grant(i + 1)])
    );
    const f = fakeDb(full);
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh: vi.fn() });
    expect(await store.listDue(NOW)).toHaveLength(DUE_PAGE_SIZE);
    expect(f.reads.queryPages).toBe(2);
  });

  it('skips a grant with no nextPollAt on an ordinary run', async () => {
    const f = fakeDb({ 1: { ...grant(1), nextPollAt: undefined } });
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh: vi.fn() });
    expect(await store.listDue(NOW)).toEqual([]);
  });

  it('the daily full listing treats a grant with no nextPollAt as due and stamps it', async () => {
    const f = fakeDb({
      1: { ...grant(1), nextPollAt: undefined },
      2: grant(2, { nextPollAt: FULL_LISTING_NOW + 1 }),
      3: grant(3, { nextPollAt: FULL_LISTING_NOW }),
    });
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh: vi.fn() });
    expect((await store.listDue(FULL_LISTING_NOW)).map((l) => l.characterId)).toEqual([1, 3]);
    expect(f.docs.get('1')!.nextPollAt).toBe(0);
  });

  it('defers a grant by writing only its nextPollAt', async () => {
    const f = fakeDb({ 1: grant(1) });
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh: vi.fn() });
    await store.deferNextPoll(1, NOW + 5);
    expect(f.docs.get('1')).toEqual({
      ...grant(1),
      encryptedRefreshToken: expect.any(String),
      nextPollAt: NOW + 5,
    });
    expect((await store.listDue(NOW)).map((l) => l.characterId)).toEqual([]);
  });
});
