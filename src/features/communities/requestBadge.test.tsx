import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { db } from '@/db';
import type { CommunityRequest } from '@/engine/communities/requests';

const auth = vi.hoisted(() => ({ uid: 'char:1' as string | null }));
vi.mock('@/sync/firebaseApp', () => ({
  getSyncAuth: () => ({ currentUser: auth.uid ? { uid: auth.uid } : null }),
}));
const store = vi.hoisted(() => ({ loadMyCommunitiesCached: vi.fn() }));
vi.mock('./communityStore', () => store);
const requestStore = vi.hoisted(() => ({ loadRequestsSince: vi.fn() }));
vi.mock('./requestStore', () => requestStore);
const leader = vi.hoisted(() => ({ is: true, onChange: () => {} }));
vi.mock('@/lib/tabLeader', () => ({
  joinTabElection: (_job: string, onChange: () => void) => {
    leader.onChange = onChange;
    return { isLeader: () => leader.is, leave: () => {} };
  },
}));

import {
  markRequestsSeen,
  refreshRequestBadge,
  rememberCommunityWatch,
  resetRequestBadge,
  REQUEST_BADGE_POLL_MS,
  useNewRequestCount,
  useRequestBadgePoll,
  watchRequestsViewed,
} from './requestBadge';
import { useActiveCharacter } from '@/stores/activeCharacter';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const request = (id: string, over: Partial<CommunityRequest> = {}): CommunityRequest => ({
  id,
  ownerUid: 'char:2',
  ownerName: 'Two',
  location: '',
  terms: '',
  lines: [{ typeId: 1, name: 'Tritanium', quantity: 1, kind: 'item' }],
  createdAt: NOW - 1000,
  lastActivityAt: NOW - 1000,
  expiresAt: NOW + DAY,
  closed: false,
  notify: { app: true, mail: false },
  ...over,
});
const community = (id: string) => ({
  id,
  name: id,
  adminUid: 'char:9',
  inviteCode: null,
  memberCount: 2,
});

beforeEach(async () => {
  vi.clearAllMocks();
  leader.is = true;
  await db.settings.clear();
  auth.uid = 'char:1';
  resetRequestBadge();
  store.loadMyCommunitiesCached.mockResolvedValue([community('c1'), community('c2')]);
  requestStore.loadRequestsSince.mockResolvedValue([
    request('a'),
    request('b'),
    request('mine', { ownerUid: 'char:1' }),
  ]);
});

describe('Communities nav badge', () => {
  it('reads nothing for a Character with no Community on record', async () => {
    await refreshRequestBadge(1, NOW);
    expect(store.loadMyCommunitiesCached).not.toHaveBeenCalled();
  });

  it('treats what is already on a board at the first read as seen, then counts what arrives', async () => {
    await rememberCommunityWatch(1, [community('c1')]);
    const { result } = renderHook(() => useNewRequestCount());
    await refreshRequestBadge(1, NOW);
    expect(result.current).toBe(0);
    requestStore.loadRequestsSince.mockResolvedValue([
      request('a'),
      request('c', { createdAt: NOW + 5 }),
      request('mine', { ownerUid: 'char:1', createdAt: NOW + 6 }),
    ]);
    await act(() => refreshRequestBadge(1, NOW + 10));
    // Two Communities each show the new Request; nothing of mine, nothing already seen.
    expect(result.current).toBe(2);
  });

  it('asks each Community only for what was posted since it was last seen', async () => {
    await rememberCommunityWatch(1, [community('c1')]);
    await db.settings.bulkPut([
      { key: 'communityRequestsSeen:1:c1', value: NOW - DAY },
      { key: 'communityRequestsSeen:1:c2', value: NOW - 5 },
    ]);
    await refreshRequestBadge(1, NOW);
    expect(requestStore.loadRequestsSince.mock.calls).toEqual([
      [1, 'c1', NOW - DAY],
      [1, 'c2', NOW - 5],
    ]);
  });

  it('clears a Community’s count when its Requests tab is looked at', async () => {
    await rememberCommunityWatch(1, [community('c1')]);
    await db.settings.bulkPut([
      { key: 'communityRequestsSeen:1:c1', value: NOW - DAY },
      { key: 'communityRequestsSeen:1:c2', value: NOW - DAY },
    ]);
    const { result } = renderHook(() => useNewRequestCount());
    await act(() => refreshRequestBadge(1, NOW));
    expect(result.current).toBe(4);
    await act(() => markRequestsSeen(1, 'c1', NOW));
    expect(result.current).toBe(2);
    await act(() => refreshRequestBadge(1, NOW + 1));
    expect(result.current).toBe(2);
  });

  it('stays quiet while the Firebase session is not this Character’s', async () => {
    await rememberCommunityWatch(1, [community('c1')]);
    auth.uid = 'char:77';
    await refreshRequestBadge(1, NOW);
    expect(store.loadMyCommunitiesCached).not.toHaveBeenCalled();
  });

  it('does not publish a refresh that began before a change of Character', async () => {
    await rememberCommunityWatch(1, [community('c1')]);
    const { result } = renderHook(() => useNewRequestCount());
    await refreshRequestBadge(1, NOW);
    let release: () => void = () => undefined;
    requestStore.loadRequestsSince.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve([request('c', { createdAt: NOW + 5 })]);
      })
    );
    const pending = refreshRequestBadge(1, NOW + 10);
    // Switch Character while that read is in flight.
    await vi.waitFor(() => expect(requestStore.loadRequestsSince).toHaveBeenCalledTimes(1));
    act(() => resetRequestBadge());
    release();
    await act(() => pending);
    expect(result.current).toBe(0);
  });

  it('counts nothing new in a Community whose Requests tab is on screen', async () => {
    await rememberCommunityWatch(1, [community('c1'), community('c2')]);
    const { result } = renderHook(() => useNewRequestCount());
    await refreshRequestBadge(1, NOW);
    const unwatch = watchRequestsViewed('c1');
    requestStore.loadRequestsSince.mockResolvedValue([request('c', { createdAt: NOW + 5 })]);
    await act(() => refreshRequestBadge(1, NOW + 10));
    expect(result.current).toBe(1);
    unwatch();
  });

  it('drops a Community whose tab was opened while the read was in flight', async () => {
    await rememberCommunityWatch(1, [community('c1'), community('c2')]);
    const { result } = renderHook(() => useNewRequestCount());
    await refreshRequestBadge(1, NOW);
    let release: () => void = () => undefined;
    requestStore.loadRequestsSince.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve([request('c', { createdAt: NOW + 5 })]);
      })
    );
    const pending = refreshRequestBadge(1, NOW + 10);
    await vi.waitFor(() => expect(requestStore.loadRequestsSince).toHaveBeenCalledTimes(1));
    // c1 was already read as new; the viewer opens it before the read finishes.
    const unwatch = watchRequestsViewed('c1');
    release();
    await act(() => pending);
    // Only c2 (still unseen) counts.
    expect(result.current).toBe(1);
    unwatch();
  });
});

describe('request badge poll while offline', () => {
  function setOnLine(value: boolean) {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'onLine');
    vi.useRealTimers();
    useActiveCharacter.setState({ activeCharacterId: null });
  });

  it('skips its tick while offline, then reads when the connection returns', async () => {
    await rememberCommunityWatch(1, [community('c1')]);
    useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    setOnLine(false);
    renderHook(() => useRequestBadgePoll());

    await act(async () => {
      vi.advanceTimersByTime(REQUEST_BADGE_POLL_MS);
    });
    expect(store.loadMyCommunitiesCached).not.toHaveBeenCalled();

    setOnLine(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await vi.waitFor(() => expect(store.loadMyCommunitiesCached).toHaveBeenCalledTimes(1));
  });
});

describe('request badge poll: which tab reads', () => {
  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  }

  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    vi.useRealTimers();
    useActiveCharacter.setState({ activeCharacterId: null });
  });

  it('reads nothing in a hidden tab, then reads when it is shown', async () => {
    await rememberCommunityWatch(1, [community('c1')]);
    useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    setVisibility('hidden');
    renderHook(() => useRequestBadgePoll());
    await act(async () => {
      vi.advanceTimersByTime(REQUEST_BADGE_POLL_MS);
    });
    expect(store.loadMyCommunitiesCached).not.toHaveBeenCalled();

    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await vi.waitFor(() => expect(store.loadMyCommunitiesCached).toHaveBeenCalledTimes(1));
  });

  it('reads nothing in a visible tab that is not the leader, then reads once it leads', async () => {
    await rememberCommunityWatch(1, [community('c1')]);
    useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    setVisibility('visible');
    leader.is = false;
    renderHook(() => useRequestBadgePoll());
    await act(async () => {
      vi.advanceTimersByTime(REQUEST_BADGE_POLL_MS);
    });
    expect(store.loadMyCommunitiesCached).not.toHaveBeenCalled();

    leader.is = true;
    await act(async () => leader.onChange());
    await vi.waitFor(() => expect(store.loadMyCommunitiesCached).toHaveBeenCalledTimes(1));
  });
});
