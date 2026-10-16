import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { MemberLibrary } from '@/engine/communities/libraryMatrix';
import {
  deleteCommunitySnapshot,
  deleteCommunitySnapshots,
  isNetworkFailure,
  loadCommunitySnapshot,
  loadLibrariesWithFallback,
  loadWithSnapshot,
  pruneCommunitySnapshots,
  saveCommunitySnapshot,
} from './communityCache';

const online = vi.hoisted(() => ({ value: true }));
vi.mock('@/stores/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/network')>()),
  isOnline: () => online.value,
}));

beforeEach(async () => {
  online.value = true;
  await db.settings.clear();
});

const list = [{ id: 'c1', name: 'Pals', adminUid: 'char:1', inviteCode: null, memberCount: 2 }];

describe('communityCache', () => {
  it('returns null when nothing was saved', async () => {
    expect(await loadCommunitySnapshot(1, 'list')).toBeNull();
  });

  it('round-trips a snapshot', async () => {
    await saveCommunitySnapshot(1, 'list', list);
    expect(await loadCommunitySnapshot(1, 'list')).toEqual(list);
  });

  it('scopes a snapshot per Character and per Community', async () => {
    await saveCommunitySnapshot(1, 'members', [{ uid: 'a' }], 'c1');
    expect(await loadCommunitySnapshot(2, 'members', 'c1')).toBeNull();
    expect(await loadCommunitySnapshot(1, 'members', 'c2')).toBeNull();
    expect(await loadCommunitySnapshot(1, 'members', 'c1')).toEqual([{ uid: 'a' }]);
  });

  it('purges one Character without touching another with a longer id', async () => {
    await saveCommunitySnapshot(1, 'list', list);
    await saveCommunitySnapshot(1, 'members', [], 'c1');
    await saveCommunitySnapshot(10, 'list', list);
    await deleteCommunitySnapshots(1);
    expect(await loadCommunitySnapshot(1, 'list')).toBeNull();
    expect(await loadCommunitySnapshot(1, 'members', 'c1')).toBeNull();
    expect(await loadCommunitySnapshot(10, 'list')).toEqual(list);
  });

  it('survives a failing write', async () => {
    await expect(saveCommunitySnapshot(1, 'list', () => 1)).resolves.toBeUndefined();
  });

  it('deletes one Community’s snapshots only', async () => {
    await saveCommunitySnapshot(1, 'list', list);
    await saveCommunitySnapshot(1, 'members', [], 'c1');
    await saveCommunitySnapshot(1, 'libraries', [], 'c1');
    await saveCommunitySnapshot(1, 'members', [], 'c10');
    await deleteCommunitySnapshot(1, 'c1');
    expect(await loadCommunitySnapshot(1, 'members', 'c1')).toBeNull();
    expect(await loadCommunitySnapshot(1, 'libraries', 'c1')).toBeNull();
    expect(await loadCommunitySnapshot(1, 'members', 'c10')).toEqual([]);
    expect(await loadCommunitySnapshot(1, 'list')).toEqual(list);
  });

  it('prunes the snapshots of Communities no longer listed', async () => {
    await saveCommunitySnapshot(1, 'members', [1], 'c1');
    await saveCommunitySnapshot(1, 'members', [2], 'c2');
    await saveCommunitySnapshot(1, 'libraries', [], 'c2');
    await saveCommunitySnapshot(2, 'members', [3], 'c3');
    await pruneCommunitySnapshots(1, ['c1']);
    expect(await loadCommunitySnapshot(1, 'members', 'c1')).toEqual([1]);
    expect(await loadCommunitySnapshot(1, 'members', 'c2')).toBeNull();
    expect(await loadCommunitySnapshot(1, 'libraries', 'c2')).toBeNull();
    expect(await loadCommunitySnapshot(2, 'members', 'c3')).toEqual([3]);
  });
});

describe('isNetworkFailure', () => {
  it('reads a fetch failure and an offline Firestore as the network, and a denial as not', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(Object.assign(new Error('offline'), { code: 'unavailable' }))).toBe(
      true
    );
    expect(
      isNetworkFailure(Object.assign(new Error('x'), { code: 'auth/network-request-failed' }))
    ).toBe(true);
    expect(isNetworkFailure(Object.assign(new Error('no'), { code: 'permission-denied' }))).toBe(
      false
    );
    expect(isNetworkFailure(new Error('boom'))).toBe(false);
  });
});

describe('loadWithSnapshot', () => {
  const live = vi.fn();
  beforeEach(() => {
    live.mockReset();
  });
  const run = () =>
    loadWithSnapshot<string[]>({ characterId: 1, kind: 'members', communityId: 'c1', live });

  it('returns and saves the live read', async () => {
    live.mockResolvedValue(['a']);
    expect(await run()).toEqual({ value: ['a'], cached: false });
    expect(await loadCommunitySnapshot(1, 'members', 'c1')).toEqual(['a']);
  });

  it('falls back to the snapshot on a network failure', async () => {
    await saveCommunitySnapshot(1, 'members', ['old'], 'c1');
    live.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await run()).toEqual({ value: ['old'], cached: true });
  });

  it('rethrows a denial rather than showing the snapshot', async () => {
    await saveCommunitySnapshot(1, 'members', ['old'], 'c1');
    const denied = Object.assign(new Error('no'), { code: 'permission-denied' });
    live.mockRejectedValue(denied);
    await expect(run()).rejects.toBe(denied);
  });

  it('rethrows a network failure when nothing was saved', async () => {
    live.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(run()).rejects.toBeInstanceOf(TypeError);
  });

  it('goes straight to the snapshot while the browser knows it is offline', async () => {
    await saveCommunitySnapshot(1, 'members', ['old'], 'c1');
    online.value = false;
    live.mockReturnValue(new Promise(() => {}));
    expect(await run()).toEqual({ value: ['old'], cached: true });
    expect(live).not.toHaveBeenCalled();
  });

  it('tries the live read when offline with nothing saved', async () => {
    online.value = false;
    live.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(run()).rejects.toBeInstanceOf(TypeError);
    expect(live).toHaveBeenCalledTimes(1);
  });
});

describe('loadLibrariesWithFallback', () => {
  const lib = (uid: string, n: number): MemberLibrary => ({
    uid,
    items: Array.from({ length: n }, (_, i) => ({ typeId: i + 1 }) as never),
  });
  const load = vi.fn();
  beforeEach(() => {
    load.mockReset();
  });
  const run = (uids: string[]) => loadLibrariesWithFallback(1, 'c1', uids, load);

  it('returns the live libraries and saves them', async () => {
    load.mockResolvedValue({ libraries: [lib('a', 1), lib('b', 2)], failedUids: [] });
    const result = await run(['a', 'b']);
    expect(result.cached).toBe(false);
    expect(await loadCommunitySnapshot(1, 'libraries', 'c1')).toEqual([lib('a', 1), lib('b', 2)]);
  });

  it('keeps an unreadable Member empty while online, and its old copy in the snapshot', async () => {
    await saveCommunitySnapshot(1, 'libraries', [lib('a', 1), lib('b', 2)], 'c1');
    load.mockResolvedValue({ libraries: [lib('a', 3), lib('b', 0)], failedUids: ['b'] });
    const result = await run(['a', 'b']);
    expect(result).toEqual({ libraries: [lib('a', 3), lib('b', 0)], cached: false });
    expect(await loadCommunitySnapshot(1, 'libraries', 'c1')).toEqual([lib('a', 3), lib('b', 2)]);
  });

  it('shows the snapshot when every read failed', async () => {
    await saveCommunitySnapshot(1, 'libraries', [lib('a', 1)], 'c1');
    load.mockResolvedValue({ libraries: [lib('a', 0)], failedUids: ['a'] });
    expect(await run(['a'])).toEqual({ libraries: [lib('a', 1)], cached: true });
  });

  it('shows the snapshot when the sign-in itself failed on the network', async () => {
    await saveCommunitySnapshot(1, 'libraries', [lib('a', 1)], 'c1');
    load.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await run(['a'])).toEqual({ libraries: [lib('a', 1)], cached: true });
  });

  it('reads empty, not cached, when every read failed and nothing was saved', async () => {
    load.mockResolvedValue({ libraries: [lib('a', 0)], failedUids: ['a'] });
    expect(await run(['a'])).toEqual({ libraries: [lib('a', 0)], cached: false });
  });

  it('uses the snapshot without a network round while offline', async () => {
    await saveCommunitySnapshot(1, 'libraries', [lib('a', 1), lib('gone', 4)], 'c1');
    online.value = false;
    const result = await run(['a', 'new']);
    expect(load).not.toHaveBeenCalled();
    expect(result).toEqual({ libraries: [lib('a', 1), lib('new', 0)], cached: true });
  });
});
