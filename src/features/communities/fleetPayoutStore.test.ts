import { beforeEach, describe, expect, it, vi } from 'vitest';

const fire = vi.hoisted(() => ({
  docs: [] as { id: string; data: Record<string, unknown> }[],
  paths: [] as string[],
  wheres: [] as unknown[][],
}));
vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  where: (...args: unknown[]) => {
    fire.wheres.push(args);
    return {};
  },
  query: (q: { path: string }) => q,
  getDocs: async (q: { path: string }) => {
    fire.paths.push(q.path);
    return { docs: fire.docs.map((d) => ({ id: d.id, data: () => d.data })) };
  },
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: async () => 'char:1' }));
const comm = vi.hoisted(() => ({ callCommunity: vi.fn(async () => ({ payoutId: 'p9' })) }));
vi.mock('./communityStore', () => comm);

import {
  createFleetPayout,
  loadFleetPayouts,
  loadFleetShares,
  loadMyFleetShare,
  removeFleetPayout,
  setFleetShareDone,
} from './fleetPayoutStore';

const payoutDoc = (createdAt: number) => ({
  ownerUid: 'char:1',
  totalIsk: 100,
  createdAt,
  rule: 'equal',
});
const shareDoc = (pilotName: string, memberUid?: string) => ({ pilotName, isk: 5, memberUid });

beforeEach(() => {
  fire.docs = [];
  fire.paths = [];
  fire.wheres = [];
  comm.callCommunity.mockClear();
});

describe('loadFleetPayouts', () => {
  it('reads the collection newest first and skips malformed documents', async () => {
    fire.docs = [
      { id: 'old', data: payoutDoc(1) },
      { id: 'bad', data: { name: 'no total' } },
      { id: 'new', data: payoutDoc(9) },
    ];
    const out = await loadFleetPayouts(1, 'c1');
    expect(fire.paths).toEqual(['communities/c1/fleetPayouts']);
    expect(out.map((p) => p.id)).toEqual(['new', 'old']);
  });
});

describe('loadFleetShares', () => {
  it('orders by numeric id', async () => {
    fire.docs = [
      { id: '10', data: shareDoc('B') },
      { id: '2', data: shareDoc('A') },
    ];
    const out = await loadFleetShares(1, 'c1', 'p1');
    expect(fire.paths).toEqual(['communities/c1/fleetPayouts/p1/shares']);
    expect(out.map((s) => s.pilotName)).toEqual(['A', 'B']);
  });
});

describe('loadMyFleetShare', () => {
  it('queries on the viewer memberUid', async () => {
    fire.docs = [{ id: '3', data: shareDoc('Me', 'char:1') }];
    const mine = await loadMyFleetShare(1, 'c1', 'p1');
    expect(fire.wheres[0]).toEqual(['memberUid', '==', 'char:1']);
    expect(mine?.pilotName).toBe('Me');
  });
  it('is null with no Share', async () => {
    expect(await loadMyFleetShare(1, 'c1', 'p1')).toBeNull();
  });
});

describe('callables', () => {
  it('send the agreed names and payloads', async () => {
    const draft = { name: 'n', totalIsk: 1, holdBackPct: 0, rule: 'equal' as const, shares: [] };
    await createFleetPayout(1, 'c1', draft);
    await setFleetShareDone(1, 'c1', 'p1', '2', true);
    await removeFleetPayout(1, 'c1', 'p1');
    expect(comm.callCommunity.mock.calls).toEqual([
      [1, 'createCommunityFleetPayoutCallable', { communityId: 'c1', ...draft }],
      [
        1,
        'setCommunityFleetShareDoneCallable',
        { communityId: 'c1', payoutId: 'p1', shareId: '2', paid: true },
      ],
      [1, 'removeCommunityFleetPayoutCallable', { communityId: 'c1', payoutId: 'p1' }],
    ]);
  });
});
