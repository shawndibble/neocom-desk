import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  FLEET_PAYOUT_EXPIRED_RETENTION_MS,
  FLEET_PAYOUT_LIFETIME_MS,
} from './communityFleetPayouts.js';
import { sweepFleetPayouts } from './communityFleetPayoutsCleanup.js';
import { deleteMemberShares } from './communitiesStore.js';

type Doc = Record<string, unknown>;

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
      listDocuments: async () => directChildren(path).map((row) => ref(row.path)),
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
    return [...docs.entries()]
      .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
      .map(([p, data]) => ({ path: p, data }));
  }
  const db = {
    collection,
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
  return { db, docs, recursiveDeletes, bulkDeletes, failOn, hooks };
}

const NOW = 5_000_000_000_000;
const C = 'communities/c1';
const payout = (over: Doc = {}): Doc => ({
  ownerUid: 'char:2',
  expiresAt: NOW + FLEET_PAYOUT_LIFETIME_MS,
  ...over,
});

describe('sweepFleetPayouts', () => {
  it('deletes Payouts expired a week ago with their Shares, keeps the rest', async () => {
    const f = fakeDb({
      [C]: {},
      [`${C}/fleetPayouts/old`]: payout({ expiresAt: NOW - FLEET_PAYOUT_EXPIRED_RETENTION_MS }),
      [`${C}/fleetPayouts/old/shares/0`]: { isk: 1 },
      [`${C}/fleetPayouts/recent`]: payout({
        expiresAt: NOW - FLEET_PAYOUT_EXPIRED_RETENTION_MS + 1,
      }),
      [`${C}/fleetPayouts/live`]: payout(),
      [`${C}/fleetPayouts/live/shares/0`]: { isk: 1 },
    });
    expect(await sweepFleetPayouts(f.db, NOW)).toEqual({
      deleted: 1,
      failed: 0,
      truncated: false,
    });
    expect([...f.docs.keys()].filter((p) => p.includes('fleetPayouts')).sort()).toEqual([
      `${C}/fleetPayouts/live`,
      `${C}/fleetPayouts/live/shares/0`,
      `${C}/fleetPayouts/recent`,
    ]);
  });

  it('sweeps every Community and is idempotent', async () => {
    const f = fakeDb({
      [C]: {},
      'communities/c2': {},
      [`${C}/fleetPayouts/a`]: payout({ expiresAt: 1 }),
      'communities/c2/fleetPayouts/b': payout({ expiresAt: 1 }),
    });
    expect((await sweepFleetPayouts(f.db, NOW)).deleted).toBe(2);
    expect(await sweepFleetPayouts(f.db, NOW)).toEqual({ deleted: 0, failed: 0, truncated: false });
  });

  it('re-reads before deleting, so one extended meanwhile survives', async () => {
    const f = fakeDb({ [C]: {}, [`${C}/fleetPayouts/a`]: payout({ expiresAt: 1 }) });
    f.hooks.afterQuery = () => void f.docs.set(`${C}/fleetPayouts/a`, payout());
    expect((await sweepFleetPayouts(f.db, NOW)).deleted).toBe(0);
  });

  it('counts a failed delete and carries on', async () => {
    const f = fakeDb({
      [C]: {},
      [`${C}/fleetPayouts/a`]: payout({ expiresAt: 1 }),
      [`${C}/fleetPayouts/b`]: payout({ expiresAt: 2 }),
    });
    f.failOn.add(`${C}/fleetPayouts/a`);
    expect(await sweepFleetPayouts(f.db, NOW)).toEqual({ deleted: 1, failed: 1, truncated: false });
  });

  it('stops at the per-run cap and says so', async () => {
    const seed: Record<string, Doc> = { [C]: {} };
    for (let i = 0; i < 5; i += 1) seed[`${C}/fleetPayouts/p${i}`] = payout({ expiresAt: i + 1 });
    const f = fakeDb(seed);
    expect(await sweepFleetPayouts(f.db, NOW, { maxDeletes: 3, pageSize: 2 })).toEqual({
      deleted: 3,
      failed: 0,
      truncated: true,
    });
  });
});

describe('leaving deletes a Member’s own Fleet Payouts', () => {
  it('removes theirs with Shares; other bosses’ Payouts keep the left Member’s Share', async () => {
    const f = fakeDb({
      [`${C}/fleetPayouts/mine`]: payout({ ownerUid: 'char:2' }),
      [`${C}/fleetPayouts/mine/shares/0`]: { memberUid: 'char:3' },
      [`${C}/fleetPayouts/other`]: payout({ ownerUid: 'char:5' }),
      [`${C}/fleetPayouts/other/shares/0`]: { memberUid: 'char:2' },
    });
    await deleteMemberShares(f.db, 'c1', 'char:2');
    expect(f.docs.has(`${C}/fleetPayouts/mine`)).toBe(false);
    expect(f.docs.has(`${C}/fleetPayouts/mine/shares/0`)).toBe(false);
    expect(f.docs.has(`${C}/fleetPayouts/other/shares/0`)).toBe(true);
  });
});
