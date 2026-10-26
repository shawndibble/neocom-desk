import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';

const store = vi.hoisted(() => ({
  version: { stamp: 1, reset: 0 } as { stamp: number; reset: number } | null,
  whole: [] as CommunityRequest[],
  wholePledges: new Map<string, RequestPledge[]>(),
  activeSince: [] as CommunityRequest[],
  pledgesSince: new Map<string, RequestPledge[]>(),
  deltaFails: false,
  pledgesFail: false,
  calls: [] as string[],
}));

vi.mock('./requestStore', () => ({
  loadBoardVersion: async () => {
    store.calls.push('version');
    return store.version;
  },
  loadRequests: async () => {
    store.calls.push('requests');
    return store.whole;
  },
  loadCommunityPledges: async () => {
    store.calls.push('pledges');
    if (store.pledgesFail) throw new Error('rules');
    return store.wholePledges;
  },
  loadRequestsActiveSince: async (_c: number, _id: string, since: number) => {
    store.calls.push(`requestsSince:${since}`);
    if (store.deltaFails) throw new Error('no index');
    return store.activeSince;
  },
  loadCommunityPledgesSince: async (_c: number, _id: string, since: number) => {
    store.calls.push(`pledgesSince:${since}`);
    return store.pledgesSince;
  },
}));

import {
  BOARD_MAX_AGE_MS,
  REQUEST_DELTA_MARGIN_MS,
  clearBoardCache,
  loadBoard,
} from './boardCache';

const request = (id: string, createdAt: number, lastActivityAt = createdAt): CommunityRequest => ({
  id,
  ownerUid: 'char:1',
  ownerName: 'Owner',
  location: 'Jita',
  terms: '',
  lines: [{ typeId: 34, name: 'Tritanium', quantity: 10, kind: 'item' }],
  createdAt,
  lastActivityAt,
  expiresAt: 9e12,
  closed: false,
  notify: { app: false, mail: false },
});
const pledge = (uid: string, quantity: number, updatedAt: number): RequestPledge => ({
  uid,
  lines: { 0: { quantity, delivered: 0, contractIds: [] } },
  updatedAt,
});

beforeEach(() => {
  clearBoardCache();
  store.version = { stamp: 1, reset: 0 };
  store.whole = [request('a', 100), request('b', 200, 300)];
  store.wholePledges = new Map([['a', [pledge('char:2', 5, 400)]]]);
  store.activeSince = [];
  store.pledgesSince = new Map();
  store.deltaFails = false;
  store.pledgesFail = false;
  store.calls = [];
});

describe('loadBoard', () => {
  it('reads the whole board the first time, newest first', async () => {
    const board = await loadBoard(1, 'c1', 0);
    expect(board.requests.map((r) => r.id)).toEqual(['a', 'b']);
    expect(store.calls).toEqual(['version', 'requests', 'pledges']);
  });

  it('reads only the version when the stamp has not moved', async () => {
    await loadBoard(1, 'c1', 0);
    store.calls = [];
    const board = await loadBoard(1, 'c1', 1000);
    expect(store.calls).toEqual(['version']);
    expect(board.requests).toHaveLength(2);
    expect(board.pledges?.get('a')).toHaveLength(1);
  });

  it('merges a delta read from the watermark when the stamp moved', async () => {
    store.whole = [request('a', 100), request('b', 200, 300 + REQUEST_DELTA_MARGIN_MS)];
    await loadBoard(1, 'c1', 0);
    store.calls = [];
    store.version = { stamp: 2, reset: 0 };
    store.activeSince = [request('b', 200, 500), request('c', 600)];
    store.pledgesSince = new Map([['a', [pledge('char:2', 8, 700), pledge('char:3', 1, 710)]]]);
    const board = await loadBoard(1, 'c1', 1000);
    expect(store.calls).toEqual(['version', 'requestsSince:300', 'pledgesSince:400']);
    expect(board.requests.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(board.requests.find((r) => r.id === 'b')?.lastActivityAt).toBe(500);
    expect(board.pledges?.get('a')?.map((p) => [p.uid, p.lines[0].quantity])).toEqual([
      ['char:2', 8],
      ['char:3', 1],
    ]);
    // The merged board is the new cache: the same stamp now costs one read.
    store.calls = [];
    await loadBoard(1, 'c1', 2000);
    expect(store.calls).toEqual(['version']);
  });

  it('reads the whole board again when something was deleted (reset moved)', async () => {
    await loadBoard(1, 'c1', 0);
    store.calls = [];
    store.version = { stamp: 2, reset: 2 };
    store.whole = [request('b', 200, 300)];
    const board = await loadBoard(1, 'c1', 1000);
    expect(store.calls).toEqual(['version', 'requests', 'pledges']);
    expect(board.requests.map((r) => r.id)).toEqual(['b']);
  });

  it('reads the whole board again when the delta fails', async () => {
    await loadBoard(1, 'c1', 0);
    store.calls = [];
    store.version = { stamp: 2, reset: 0 };
    store.deltaFails = true;
    await loadBoard(1, 'c1', 1000);
    expect(store.calls).toContain('requests');
  });

  it('reads the whole board again once the cache is too old', async () => {
    await loadBoard(1, 'c1', 0);
    store.calls = [];
    await loadBoard(1, 'c1', BOARD_MAX_AGE_MS + 1);
    expect(store.calls).toEqual(['version', 'requests', 'pledges']);
  });

  it('keeps a board per Community', async () => {
    await loadBoard(1, 'c1', 0);
    store.calls = [];
    await loadBoard(1, 'c2', 10);
    expect(store.calls).toEqual(['version', 'requests', 'pledges']);
  });

  it('never caches a board whose Pledges failed to read', async () => {
    store.pledgesFail = true;
    const board = await loadBoard(1, 'c1', 0);
    expect(board.pledges).toBeNull();
    store.pledgesFail = false;
    store.calls = [];
    await loadBoard(1, 'c1', 10);
    expect(store.calls).toEqual(['version', 'requests', 'pledges']);
  });

  it('skips the cache when there is no version (a backend override)', async () => {
    store.version = null;
    await loadBoard(1, 'c1', 0);
    store.calls = [];
    await loadBoard(1, 'c1', 10);
    expect(store.calls).toEqual(['version', 'requests', 'pledges']);
  });
});
