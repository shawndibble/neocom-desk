import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PledgeEntry } from '@/engine/communities/requests';

const fire = vi.hoisted(() => ({
  stored: null as Record<string, unknown> | null,
  sets: [] as unknown[],
  deletes: 0,
  docs: [] as { id: string; data: Record<string, unknown> }[],
  /** How many times the transaction callback runs: a retry re-reads the document. */
  attempts: 1,
  reads: [] as string[],
  wheres: [] as unknown[][],
  /** Runs before each retry's read, as another device's write would. */
  beforeRetry: null as null | (() => void),
  /** The next getDocs fails as a query whose index is not deployed does. */
  missingIndex: false,
}));

vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  collectionGroup: () => ({}),
  where: (...args: unknown[]) => {
    fire.wheres.push(args);
    return {};
  },
  query: (q: unknown) => q,
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDocs: async () => {
    if (fire.missingIndex) {
      fire.missingIndex = false;
      throw Object.assign(new Error('needs an index'), { code: 'failed-precondition' });
    }
    fire.reads.push(`read as ${session.current}`);
    return {
      docs: fire.docs.map((d) => ({ id: d.id, data: () => d.data, ref: {} })),
    };
  },
  getDoc: async () => ({
    exists: () => fire.stored !== null,
    data: () => fire.stored ?? undefined,
  }),
  serverTimestamp: () => 'SERVER_TIME',
  runTransaction: async (
    _db: unknown,
    run: (tx: {
      get: () => Promise<{ exists: () => boolean; data: () => unknown }>;
      set: (ref: unknown, data: unknown) => void;
      delete: () => void;
    }) => Promise<unknown>
  ) => {
    let out: unknown;
    for (let attempt = 0; attempt < fire.attempts; attempt += 1) {
      if (attempt > 0) fire.beforeRetry?.();
      fire.sets.length = 0;
      fire.reads.push(`write as ${session.current}`);
      out = await run({
        get: async () => ({ exists: () => fire.stored !== null, data: () => fire.stored }),
        set: (_ref, data) => {
          fire.sets.push(data);
          fire.stored = data as Record<string, unknown>;
        },
        delete: () => {
          fire.deletes += 1;
          fire.stored = null;
        },
      });
    }
    return out;
  },
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
const session = vi.hoisted(() => ({ current: 0, log: [] as string[] }));
vi.mock('@/sync/syncAuth', () => ({
  ensureSignedIn: async (characterId: number) => {
    session.log.push(`signin ${characterId}`);
    // Signing in takes a moment, and swaps the session once it lands.
    await new Promise((resolve) => setTimeout(resolve, 5));
    session.current = characterId;
    return `char:${characterId}`;
  },
}));
vi.mock('@/db', () => ({
  db: { characters: { get: async () => ({ characterId: 1, ownerHash: 'owner-1' }) } },
}));

import {
  loadMyRequests,
  loadPledges,
  loadRequests,
  loadRequestsSince,
  updateMyPledge,
} from './requestStore';

const entry = (over: Partial<PledgeEntry> = {}): PledgeEntry => ({
  quantity: 100,
  delivered: 0,
  contractIds: [],
  ...over,
});

beforeEach(() => {
  fire.stored = null;
  fire.sets = [];
  fire.deletes = 0;
  fire.docs = [];
  fire.attempts = 1;
  fire.beforeRetry = null;
  fire.reads = [];
  session.current = 0;
  session.log = [];
});

describe('updateMyPledge', () => {
  it('applies the change to the stored lines inside one transaction', async () => {
    fire.stored = { lines: { 0: { quantity: 100, delivered: 40, contractIds: [7], manual: 40 } } };
    await updateMyPledge(1, 'c1', 'r1', (lines) => ({ ...lines, 1: entry({ quantity: 5 }) }));
    expect(fire.sets).toHaveLength(1);
    expect(fire.sets[0]).toMatchObject({
      ownerHash: 'owner-1',
      communityId: 'c1',
      lines: {
        0: { quantity: 100, delivered: 40, contractIds: [7], manual: 40 },
        1: { quantity: 5, delivered: 0, contractIds: [] },
      },
    });
  });

  it('re-applies the change to the fresh document when the transaction retries', async () => {
    fire.stored = { lines: { 0: { quantity: 100, delivered: 0, contractIds: [] } } };
    fire.attempts = 2;
    // Another device marks 60 delivered between the first attempt and the retry.
    fire.beforeRetry = () => {
      fire.stored = { lines: { 0: { quantity: 100, delivered: 60, contractIds: [9] } } };
    };
    await updateMyPledge(1, 'c1', 'r1', (lines) => ({
      ...lines,
      1: entry({ quantity: 5 }),
    }));
    expect(fire.sets[0]).toMatchObject({
      lines: { 0: { delivered: 60, contractIds: [9] }, 1: { quantity: 5 } },
    });
  });

  it('deletes the document when no line is left', async () => {
    fire.stored = { lines: { 0: { quantity: 100, delivered: 0, contractIds: [] } } };
    expect(await updateMyPledge(1, 'c1', 'r1', () => ({}))).toBeNull();
    expect(fire.deletes).toBe(1);
  });
});

describe('the Firebase session', () => {
  it('is never swapped under a Pledge write by another Character’s read', async () => {
    fire.stored = { lines: { 0: { quantity: 100, delivered: 0, contractIds: [] } } };
    const write = updateMyPledge(1, 'c1', 'r1', (lines) => lines);
    // The background sweep starts reading as another Character while the write signs in.
    const read = loadRequests(2, 'c1');
    await Promise.all([write, read]);
    expect(fire.reads).toEqual(['write as 1', 'read as 2']);
    expect(session.log).toEqual(['signin 1', 'signin 2']);
  });
});

describe('reading malformed documents', () => {
  it('skips a Request with no readable line and drops lines without a type or quantity', async () => {
    fire.docs = [
      { id: 'bad', data: { lines: [{ name: 'no type' }, null, 'x'] } },
      { id: 'none', data: {} },
      {
        id: 'ok',
        data: {
          ownerUid: 'char:2',
          createdAt: 5,
          lines: [
            { typeId: 1, quantity: 2, kind: 'weird', runs: 'x' },
            { typeId: 'a', quantity: 2 },
            { typeId: 3, quantity: 4, kind: 'bpc', runs: 10, me: 9, te: 8 },
          ],
        },
      },
    ];
    const requests = await loadRequests(1, 'c1');
    expect(requests.map((r) => r.id)).toEqual(['ok']);
    expect(requests[0]?.lines).toEqual([
      { typeId: 1, name: '', quantity: 2, kind: 'item' },
      { typeId: 3, name: '', quantity: 4, kind: 'bpc', runs: 10, me: 9, te: 8 },
    ]);
  });

  it('reads the stored contract figure and finish time, ignoring bad ones', async () => {
    fire.docs = [
      {
        id: 'char:2',
        data: {
          lines: {
            0: { quantity: 10, auto: 80, through: 5 },
            1: { quantity: 10, auto: -1, through: 'x' },
          },
        },
      },
    ];
    const pledges = await loadPledges(1, 'c1', 'r1');
    expect(pledges[0]?.lines[0]).toMatchObject({ auto: 80, through: 5 });
    expect(pledges[0]?.lines[1]).not.toHaveProperty('auto');
    expect(pledges[0]?.lines[1]).not.toHaveProperty('through');
  });

  it('skips a Pledge with no lines map and bad entries, defaulting what is missing', async () => {
    fire.docs = [
      { id: 'char:1', data: {} },
      {
        id: 'char:2',
        data: {
          lines: {
            0: { quantity: 10 },
            1: { quantity: 'x' },
            2: null,
            x: { quantity: 3 },
            3: { quantity: 20, delivered: 5, contractIds: [1, 'a', 2], manual: 0 },
          },
        },
      },
    ];
    const pledges = await loadPledges(1, 'c1', 'r1');
    expect(pledges.map((p) => p.uid)).toEqual(['char:2']);
    expect(pledges[0]?.lines).toEqual({
      0: { quantity: 10, delivered: 0, contractIds: [] },
      3: { quantity: 20, delivered: 5, contractIds: [1, 2] },
    });
  });
});

describe('loadRequestsSince', () => {
  const doc = (id: string, createdAt: number) => ({
    id,
    data: {
      ownerUid: 'char:2',
      createdAt,
      lines: [{ typeId: 34, name: 'Tritanium', quantity: 5 }],
    },
  });

  it('asks only for Requests posted after the given time', async () => {
    fire.wheres.length = 0;
    fire.docs = [doc('new', 20)];
    const found = await loadRequestsSince(1, 'c1', 10);
    expect(fire.wheres).toEqual([['createdAt', '>', 10]]);
    expect(found.map((r) => r.id)).toEqual(['new']);
  });

  it('reads the whole board and filters it while the index is missing', async () => {
    fire.docs = [doc('old', 5), doc('new', 20)];
    fire.missingIndex = true;
    const found = await loadRequestsSince(1, 'c1', 10);
    expect(found.map((r) => r.id)).toEqual(['new']);
  });
});

describe('loadMyRequests', () => {
  it('asks only for the Character’s own Requests, with one single-field filter', async () => {
    fire.wheres.length = 0;
    fire.docs = [
      {
        id: 'r1',
        data: {
          ownerUid: 'char:1',
          lines: [{ typeId: 34, name: 'Tritanium', quantity: 5 }],
          notify: { app: false, mail: true },
        },
      },
    ];
    const mine = await loadMyRequests(1, 'c1');
    expect(fire.wheres).toEqual([['ownerUid', '==', 'char:1']]);
    expect(mine.map((r) => [r.id, r.notify])).toEqual([['r1', { app: false, mail: true }]]);
  });
});
