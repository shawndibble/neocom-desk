import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureAnySession } from '@/sync/syncAuth';
import {
  createShareLink,
  existingShareLink,
  loadShare,
  resetShareLinksForTests,
  saveShare,
  SHARE_TTL_MS,
  shareUrl,
} from './shareStore';

const { getDoc, setDoc, FakeTimestamp } = vi.hoisted(() => {
  /** Just enough of Firestore's `Timestamp` for the store: built from and read back as millis. */
  class FakeTimestamp {
    constructor(readonly millis: number) {}
    static fromMillis(millis: number) {
      return new FakeTimestamp(millis);
    }
    toMillis() {
      return this.millis;
    }
  }
  return { getDoc: vi.fn(), setDoc: vi.fn(), FakeTimestamp };
});

vi.mock('firebase/firestore/lite', () => ({
  getDoc,
  setDoc,
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  serverTimestamp: () => 'SERVER_TIME',
  Timestamp: FakeTimestamp,
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureAnySession: vi.fn(async () => 'char:1') }));

const NOW = Date.UTC(2026, 9, 2, 12);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  getDoc.mockReset();
  setDoc.mockReset();
  vi.mocked(ensureAnySession).mockClear();
});

function stored(data: Record<string, unknown> | null) {
  return { exists: () => data !== null, data: () => data ?? undefined };
}

describe('shareUrl', () => {
  it('is the short /share/<id> path on this origin', () => {
    vi.stubGlobal('window', { location: { origin: 'https://neocomdesk.com' } });
    try {
      expect(shareUrl('abc123XYZ')).toBe('https://neocomdesk.com/share/abc123XYZ');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('saveShare', () => {
  it('signs in, then creates the doc with a server createdAt and a week-long expiry', async () => {
    await saveShare({ id: 'abc123XYZ', type: 'appraisal', payload: { v: 1 }, characterId: 7 });

    expect(ensureAnySession).toHaveBeenCalledWith(7);
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ' },
      {
        type: 'appraisal',
        payload: { v: 1 },
        createdAt: 'SERVER_TIME',
        expiresAt: new FakeTimestamp(NOW + SHARE_TTL_MS),
      }
    );
  });
});

describe('loadShare', () => {
  it('returns the type and payload of a live share', async () => {
    getDoc.mockResolvedValue(
      stored({
        type: 'appraisal',
        payload: { v: 1 },
        createdAt: FakeTimestamp.fromMillis(NOW - 1000),
        expiresAt: FakeTimestamp.fromMillis(NOW + 1000),
      })
    );
    expect(await loadShare('abc123XYZ')).toEqual({
      ok: true,
      share: { type: 'appraisal', payload: { v: 1 }, expiresAt: NOW + 1000 },
    });
  });

  it('reads an expired doc as gone — TTL deletion lags the expiry by up to a day', async () => {
    getDoc.mockResolvedValue(
      stored({ type: 'appraisal', payload: {}, expiresAt: FakeTimestamp.fromMillis(NOW - 1) })
    );
    expect(await loadShare('abc123XYZ')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('reads a missing doc, and the rules refusing one, as gone', async () => {
    getDoc.mockResolvedValueOnce(stored(null));
    expect(await loadShare('abc123XYZ')).toEqual({ ok: false, reason: 'not-found' });

    getDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    expect(await loadShare('abc123XYZ')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('does not touch Firestore for an id that could never have been minted', async () => {
    expect(await loadShare('nope')).toEqual({ ok: false, reason: 'not-found' });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('reads an unknown type as unsupported, and a network failure as failed', async () => {
    getDoc.mockResolvedValueOnce(
      stored({ type: 'fleet', payload: {}, expiresAt: FakeTimestamp.fromMillis(NOW + 1) })
    );
    expect(await loadShare('abc123XYZ')).toEqual({ ok: false, reason: 'unsupported' });

    getDoc.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    expect(await loadShare('abc123XYZ')).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('createShareLink', () => {
  beforeEach(() => {
    resetShareLinksForTests();
    vi.stubGlobal('window', { location: { origin: 'https://neocomdesk.com' } });
    return () => vi.unstubAllGlobals();
  });

  const input = { type: 'fitting' as const, payload: { v: 1 }, reuseKey: '2.abc', characterId: 7 };

  it('stores the share under a fresh id and returns its short URL', async () => {
    const url = await createShareLink(input);
    expect(url).toMatch(/^https:\/\/neocomdesk\.com\/share\/[0-9A-Za-z]{9}$/);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0][0]).toEqual({ path: `shares/${url.split('/').pop()}` });
  });

  it('hands back the same link for the same content, without a second doc', async () => {
    const first = await createShareLink(input);
    expect(existingShareLink('fitting', '2.abc')).toBe(first);
    expect(await createShareLink(input)).toBe(first);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('makes a new link for different content, or another type', async () => {
    const first = await createShareLink(input);
    expect(await createShareLink({ ...input, reuseKey: '2.xyz' })).not.toBe(first);
    expect(await createShareLink({ ...input, type: 'appraisal' })).not.toBe(first);
    expect(setDoc).toHaveBeenCalledTimes(3);
  });

  it('stops reusing a link within a day of its expiry', async () => {
    await createShareLink(input);
    vi.setSystemTime(NOW + SHARE_TTL_MS - 23 * 60 * 60 * 1000);
    expect(existingShareLink('fitting', '2.abc')).toBeNull();
  });

  it('remembers nothing when the save fails', async () => {
    setDoc.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(createShareLink(input)).rejects.toThrow();
    expect(existingShareLink('fitting', '2.abc')).toBeNull();
  });
});
