import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { AlertGrantDoc } from './alertGrant.js';
import { encryptRefreshToken } from './alertGrantCrypto.js';
import { firestorePollerStore } from './alertGrantStore.js';
import { ALERTS_POLL_STATS_KEYS, createRunStats } from './runStats.js';

const KEY = randomBytes(32);

const grant = (id: number, over: Partial<AlertGrantDoc> = {}): AlertGrantDoc => ({
  encryptedRefreshToken: encryptRefreshToken(`rt-${id}`, id, KEY),
  clientId: 'client',
  enabledAt: 1,
  highWaterId: null,
  etag: null,
  seenTypes: [],
  status: 'active',
  ...over,
});

/** `alertGrants/{id}` in memory, counting the plain document reads the poller pays for. */
function fakeDb(initial: Record<number, AlertGrantDoc>) {
  const docs = new Map<string, AlertGrantDoc>(
    Object.entries(initial).map(([id, d]) => [id, d] as const)
  );
  const reads = { docGets: 0 };
  const snap = (id: string) => ({ id, exists: docs.has(id), data: () => docs.get(id) });
  const ref = (id: string) => ({
    id,
    get: async () => {
      reads.docGets += 1;
      return snap(id);
    },
  });
  const db = {
    collection: () => ({
      doc: (id: string) => ref(id),
      where: (_f: string, _op: string, value: string) => ({
        get: async () => ({
          docs: [...docs.entries()].filter(([, d]) => d.status === value).map(([id]) => snap(id)),
        }),
      }),
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
  it('refreshes from the grant listActive already read: no second read per Character', async () => {
    const f = fakeDb({ 1: grant(1), 2: grant(2), 3: grant(3, { status: 'revoked' }) });
    const refresh = vi.fn(async (_c: string, rt: string) => ({
      accessToken: `at-${rt}`,
      refreshToken: rt,
    }));
    const store = firestorePollerStore(f.db, { key: () => KEY, refresh });
    expect((await store.listActive()).map((l) => l.characterId)).toEqual([1, 2]);
    expect(await store.refresh(1)).toMatchObject({ kind: 'ok', accessToken: 'at-rt-1' });
    expect(await store.refresh(2)).toMatchObject({ kind: 'ok', accessToken: 'at-rt-2' });
    expect(f.reads.docGets).toBe(0);
    expect(refresh).toHaveBeenCalledWith('client', 'rt-1');
  });

  it('reads the grant itself for a Character listActive did not return', async () => {
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
    await store.listActive();
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
    await store.listActive();
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
});
