import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  CLOSED_RETENTION_MS,
  EXPIRED_RETENTION_MS,
  REQUEST_LIFETIME_MS,
} from './communityRequests.js';
import { removePledge, removeRequest, sweepRequests } from './communityRequestsCleanup.js';
import { deleteMemberShares, purgeCharacterCommunities } from './communitiesStore.js';

type Doc = Record<string, unknown>;
/** Path prefix the fake gives a collection-group query. */
const GROUP = '**/';

/**
 * An in-memory stand-in for the slice of Firestore these functions touch:
 * `communities/{c}` (+ `members/{uid}`), `itemRequests/{r}` and
 * `itemRequests/{r}/pledges/{uid}`, addressed by path. Queries support the
 * single-field `where(<=)`, `where(==)`, `orderBy`, `startAfter` and `limit`.
 */
function fakeDb(initial: Record<string, Doc>) {
  const docs = new Map<string, Doc>(Object.entries(initial));
  const recursiveDeletes: string[] = [];
  const bulkDeletes: string[] = [];
  const failOn = new Set<string>();
  const hooks: { afterQuery?: () => void } = {};
  // `missingIndex`: collection-group queries fail as they do before the index is deployed.
  const stats = { queries: 0, listings: 0, missingIndex: false };

  // A snapshot is a copy: it outlives a later delete, as a Firestore one does.
  const snap = (path: string) => {
    const data = docs.get(path);
    return {
      id: path.split('/').at(-1)!,
      exists: data !== undefined,
      ref: ref(path),
      get: (field: string) => data?.[field],
      data: () => data,
    };
  };
  const ref = (path: string): Record<string, unknown> => ({
    path,
    id: path.split('/').at(-1)!,
    get: async () => snap(path),
    set: async (data: Doc) => void docs.set(path, data),
    delete: async () => void docs.delete(path),
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const collection = (path: string) => query(path, [], undefined);
  function query(
    path: string,
    steps: ((rows: { path: string; data: Doc }[]) => { path: string; data: Doc }[])[],
    order: string | undefined
  ): Record<string, unknown> {
    const next = (step: (typeof steps)[number], by = order) => query(path, [...steps, step], by);
    return {
      doc: (id: string) => ref(`${path}/${id}`),
      listDocuments: async () => {
        stats.listings += 1;
        return directChildren(path).map((row) => ref(row.path));
      },
      where: (field: string, op: string, value: number | string) =>
        next((rows) =>
          rows.filter((row) => {
            const v = row.data[field];
            if (v === undefined || v === null) return false;
            return op === '==' ? v === value : (v as number) <= (value as number);
          })
        ),
      orderBy: (field: string) =>
        next(
          (rows) =>
            [...rows].sort((a, b) => Number(a.data[field] ?? 0) - Number(b.data[field] ?? 0)),
          field
        ),
      startAfter: (after: { get: (field: string) => unknown }) =>
        next((rows) =>
          rows.filter((r) => Number(r.data[order!] ?? 0) > Number(after.get(order!) ?? 0))
        ),
      limit: (n: number) => next((rows) => rows.slice(0, n)),
      get: async () => {
        if (path.startsWith(GROUP) && stats.missingIndex) {
          throw Object.assign(new Error('The query requires an index'), { code: 9 });
        }
        stats.queries += 1;
        let rows = directChildren(path);
        for (const step of steps) rows = step(rows);
        const found = {
          docs: rows.map((row) => snap(row.path)),
          empty: rows.length === 0,
          size: rows.length,
        };
        if (steps.length > 0) hooks.afterQuery?.();
        return found;
      },
    };
  }
  function directChildren(path: string) {
    if (path.startsWith(GROUP)) {
      const name = path.slice(GROUP.length);
      return [...docs.entries()]
        .filter(([p]) => p.split('/').at(-2) === name)
        .map(([p, data]) => ({ path: p, data }));
    }
    return [...docs.entries()]
      .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
      .map(([p, data]) => ({ path: p, data }));
  }
  const db = {
    collection,
    collectionGroup: (name: string) => collection(`${GROUP}${name}`),
    recursiveDelete: async (target: { path: string }) => {
      if (failOn.has(target.path)) throw new Error('boom');
      recursiveDeletes.push(target.path);
      for (const p of [...docs.keys()]) {
        if (p === target.path || p.startsWith(`${target.path}/`)) docs.delete(p);
      }
    },
    bulkWriter: () => ({
      delete: async (r: { path: string }) => {
        bulkDeletes.push(r.path);
        docs.delete(r.path);
      },
      close: async () => {},
    }),
  } as unknown as Firestore;
  return { db, docs, recursiveDeletes, bulkDeletes, failOn, hooks, stats };
}

const NOW = 5_000_000_000_000;
const C = 'communities/c1';
const request = (over: Doc = {}): Doc => ({
  ownerUid: 'char:2',
  closed: false,
  closedAt: null,
  lastActivityAt: NOW - 1000,
  expiresAt: NOW + REQUEST_LIFETIME_MS,
  ...over,
});

describe('sweepRequests', () => {
  it('deletes expired and long-closed Requests with their Pledges, and keeps the rest', async () => {
    const f = fakeDb({
      [`${C}`]: {},
      [`${C}/itemRequests/expired`]: request({ expiresAt: NOW - EXPIRED_RETENTION_MS }),
      [`${C}/itemRequests/justExpired`]: request({ expiresAt: NOW - EXPIRED_RETENTION_MS + 1 }),
      [`${C}/itemRequests/expired/pledges/char:3`]: { lines: {} },
      [`${C}/itemRequests/closedOld`]: request({
        closed: true,
        closedAt: NOW - CLOSED_RETENTION_MS,
      }),
      [`${C}/itemRequests/closedNew`]: request({
        closed: true,
        closedAt: NOW - CLOSED_RETENTION_MS + 1,
        expiresAt: NOW - 5,
      }),
      [`${C}/itemRequests/live`]: request(),
      [`${C}/itemRequests/live/pledges/char:3`]: { lines: {} },
    });
    const result = await sweepRequests(f.db, NOW);
    expect(result).toEqual({ deleted: 2, failed: 0, truncated: false });
    expect([...f.docs.keys()].filter((p) => p.includes('itemRequests')).sort()).toEqual([
      `${C}/itemRequests/closedNew`,
      `${C}/itemRequests/justExpired`,
      `${C}/itemRequests/live`,
      `${C}/itemRequests/live/pledges/char:3`,
    ]);
  });

  it('sweeps every Community and is idempotent', async () => {
    const f = fakeDb({
      [`${C}`]: {},
      ['communities/c2']: {},
      [`${C}/itemRequests/a`]: request({ expiresAt: 1 }),
      [`communities/c2/itemRequests/b`]: request({ expiresAt: 1 }),
    });
    expect((await sweepRequests(f.db, NOW)).deleted).toBe(2);
    expect(await sweepRequests(f.db, NOW)).toEqual({ deleted: 0, failed: 0, truncated: false });
  });

  it('an idle run is one collection-group query per rule, with no per-Community reads', async () => {
    const f = fakeDb({
      [`${C}`]: {},
      ['communities/c2']: {},
      [`${C}/itemRequests/live`]: request(),
    });
    expect((await sweepRequests(f.db, NOW)).deleted).toBe(0);
    expect(f.stats).toMatchObject({ queries: 2, listings: 0 });
  });

  it('falls back to the per-Community scan until the index is deployed', async () => {
    const f = fakeDb({
      [`${C}`]: {},
      ['communities/c2']: {},
      [`${C}/itemRequests/a`]: request({ expiresAt: 1 }),
      [`communities/c2/itemRequests/b`]: request({ closed: true, closedAt: 1 }),
    });
    f.stats.missingIndex = true;
    expect(await sweepRequests(f.db, NOW)).toEqual({ deleted: 2, failed: 0, truncated: false });
  });

  it('leaves a same-named collection outside Communities alone', async () => {
    const f = fakeDb({ ['elsewhere/x/itemRequests/a']: request({ expiresAt: 1 }) });
    expect((await sweepRequests(f.db, NOW)).deleted).toBe(0);
    expect(f.docs.has('elsewhere/x/itemRequests/a')).toBe(true);
  });

  it('counts a Request once when both queries find it', async () => {
    const f = fakeDb({
      [`${C}`]: {},
      [`${C}/itemRequests/a`]: request({ closed: true, closedAt: 1, expiresAt: 1 }),
    });
    expect((await sweepRequests(f.db, NOW)).deleted).toBe(1);
    expect(f.recursiveDeletes).toEqual([`${C}/itemRequests/a`]);
  });

  it('re-reads a candidate before deleting, so a Request extended meanwhile survives', async () => {
    const f = fakeDb({ [`${C}`]: {}, [`${C}/itemRequests/a`]: request({ expiresAt: 1 }) });
    // The owner extends between the sweep's query and its delete.
    f.hooks.afterQuery = () =>
      void f.docs.set(`${C}/itemRequests/a`, request({ expiresAt: NOW + REQUEST_LIFETIME_MS }));
    expect((await sweepRequests(f.db, NOW)).deleted).toBe(0);
    expect(f.docs.has(`${C}/itemRequests/a`)).toBe(true);
  });

  it('tolerates a Request vanishing mid-sweep', async () => {
    const f = fakeDb({ [`${C}`]: {}, [`${C}/itemRequests/a`]: request({ expiresAt: 1 }) });
    f.hooks.afterQuery = () => void f.docs.delete(`${C}/itemRequests/a`);
    expect(await sweepRequests(f.db, NOW)).toEqual({ deleted: 0, failed: 0, truncated: false });
  });

  it('counts a failed delete, carries on with the others and leaves it for the next run', async () => {
    const f = fakeDb({
      [`${C}`]: {},
      [`${C}/itemRequests/a`]: request({ expiresAt: 1 }),
      [`${C}/itemRequests/b`]: request({ expiresAt: 2 }),
    });
    f.failOn.add(`${C}/itemRequests/a`);
    expect(await sweepRequests(f.db, NOW)).toEqual({ deleted: 1, failed: 1, truncated: false });
    expect(f.docs.has(`${C}/itemRequests/a`)).toBe(true);
  });

  it('stops at the per-run delete cap and says so, for the next tick to continue', async () => {
    const seed: Record<string, Doc> = { [`${C}`]: {} };
    for (let i = 0; i < 5; i += 1) seed[`${C}/itemRequests/r${i}`] = request({ expiresAt: i + 1 });
    const f = fakeDb(seed);
    expect(await sweepRequests(f.db, NOW, { maxDeletes: 3, pageSize: 2 })).toEqual({
      deleted: 3,
      failed: 0,
      truncated: true,
    });
    expect(await sweepRequests(f.db, NOW, { maxDeletes: 3, pageSize: 2 })).toEqual({
      deleted: 2,
      failed: 0,
      truncated: false,
    });
  });
});

const admin = { uid: 'char:1', ownerHash: 'h1' };
const member = { uid: 'char:2', ownerHash: 'h2' };
const community = {
  [`${C}`]: { adminUid: 'char:1' },
  [`${C}/members/char:1`]: { ownerHash: 'h1' },
  [`${C}/members/char:2`]: { ownerHash: 'h2' },
  [`${C}/itemRequests/r1`]: request({ ownerUid: 'char:2' }),
  [`${C}/itemRequests/r1/pledges/char:3`]: { lines: {} },
  [`${C}/itemRequests/r1/pledges/char:4`]: { lines: {} },
};

const STAMP = `${C}/boardVersion/current`;

describe('the board version stamp', () => {
  it('is reset by the sweep, an admin removal and a leave, for a cached board cannot show a delete', async () => {
    const swept = fakeDb({ [`${C}`]: {}, [`${C}/itemRequests/a`]: request({ expiresAt: 1 }) });
    await sweepRequests(swept.db, NOW);
    expect(swept.docs.get(STAMP)).toHaveProperty('reset');

    const removed = fakeDb(community);
    await removeRequest(removed.db, admin, 'c1', 'r1');
    expect(removed.docs.get(STAMP)).toHaveProperty('reset');

    const unpledged = fakeDb(community);
    await removePledge(unpledged.db, admin, 'c1', 'r1', 'char:3');
    expect(unpledged.docs.get(STAMP)).toHaveProperty('reset');

    const left = fakeDb(community);
    await deleteMemberShares(left.db, 'c1', 'char:2');
    expect(left.docs.get(STAMP)).toHaveProperty('reset');
  });

  it('is left alone when the caller is refused', async () => {
    const f = fakeDb(community);
    await expect(removeRequest(f.db, member, 'c1', 'r1')).rejects.toBeDefined();
    expect(f.docs.has(STAMP)).toBe(false);
  });
});

describe('admin removal', () => {
  it('lets the Community admin remove a Request with all its Pledges', async () => {
    const f = fakeDb(community);
    await removeRequest(f.db, admin, 'c1', 'r1');
    expect([...f.docs.keys()].filter((p) => p.includes('r1'))).toEqual([]);
  });

  it('lets the admin remove one Pledge and no other', async () => {
    const f = fakeDb(community);
    await removePledge(f.db, admin, 'c1', 'r1', 'char:3');
    expect(f.docs.has(`${C}/itemRequests/r1/pledges/char:3`)).toBe(false);
    expect(f.docs.has(`${C}/itemRequests/r1/pledges/char:4`)).toBe(true);
    expect(f.docs.has(`${C}/itemRequests/r1`)).toBe(true);
  });

  it('refuses any other Member, the requester included, and changes nothing', async () => {
    const f = fakeDb(community);
    for (const call of [
      () => removeRequest(f.db, member, 'c1', 'r1'),
      () => removePledge(f.db, member, 'c1', 'r1', 'char:3'),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
    }
    expect([...f.docs.keys()]).toHaveLength(Object.keys(community).length);
  });

  it('refuses the admin Character under a different ownerHash (a sold Character)', async () => {
    const f = fakeDb(community);
    await expect(
      removeRequest(f.db, { uid: 'char:1', ownerHash: 'someone-else' }, 'c1', 'r1')
    ).rejects.toBeInstanceOf(HttpsError);
    expect(f.docs.has(`${C}/itemRequests/r1`)).toBe(true);
  });

  it('is safe to repeat: removing what is already gone is not an error', async () => {
    const f = fakeDb(community);
    await removeRequest(f.db, admin, 'c1', 'r1');
    await expect(removeRequest(f.db, admin, 'c1', 'r1')).resolves.toBeUndefined();
    await expect(removePledge(f.db, admin, 'c1', 'r1', 'char:3')).resolves.toBeUndefined();
  });
});

describe('leaving and removal delete a Member’s Requests and Pledges', () => {
  const seeded = {
    ...community,
    [`${C}/itemRequests/r2`]: request({ ownerUid: 'char:5' }),
    [`${C}/itemRequests/r2/pledges/char:2`]: { lines: {} },
    [`${C}/itemRequests/r2/pledges/char:6`]: { lines: {} },
  };

  it('deleteMemberShares removes their own Requests (with Pledges) and their Pledges on others', async () => {
    const f = fakeDb(seeded);
    await deleteMemberShares(f.db, 'c1', 'char:2');
    expect(f.recursiveDeletes).toContain(`${C}/itemRequests/r1`);
    expect(f.docs.has(`${C}/itemRequests/r1/pledges/char:3`)).toBe(false);
    expect(f.docs.has(`${C}/itemRequests/r2/pledges/char:2`)).toBe(false);
    expect(f.docs.has(`${C}/itemRequests/r2/pledges/char:6`)).toBe(true);
    expect(f.docs.has(`${C}/itemRequests/r2`)).toBe(true);
  });

  it('the stale-account purge reaches both through the Character’s Community index', async () => {
    const f = fakeDb({
      ...seeded,
      ['characters/char:2/communities/c1']: { communityId: 'c1' },
    });
    // removeMemberData runs a transaction; the stand-in has none, so give it a thin one.
    (f.db as unknown as { runTransaction: unknown }).runTransaction = async (
      fn: (tx: unknown) => Promise<void>
    ) =>
      fn({
        get: async (r: { get: () => Promise<unknown> }) => r.get(),
        delete: (r: { path: string }) => f.docs.delete(r.path),
        update: () => undefined,
      });
    await purgeCharacterCommunities(f.db, 'char:2');
    expect(f.docs.has(`${C}/itemRequests/r1`)).toBe(false);
    expect(f.docs.has(`${C}/itemRequests/r2/pledges/char:2`)).toBe(false);
    expect(f.docs.has(`${C}/members/char:2`)).toBe(false);
  });
});
