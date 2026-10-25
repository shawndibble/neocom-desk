import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { firestoreNearbyStore, forgetNearbyCharacter } from './nearbyStore.js';

/** `deviceRegistrations` in memory, with the one query the nearby store runs. */
function fakeDb(docs: Record<string, Record<string, unknown>>) {
  const queries: number[][] = [];
  const update = vi.fn<(id: string, value: unknown) => Promise<void>>(async () => {});
  const remove = vi.fn<(id: string) => Promise<void>>(async () => {});
  const db = {
    collection: () => ({
      doc: (id: string) => ({ update: (v: unknown) => update(id, v), delete: () => remove(id) }),
      where: (_f: string, _op: string, ids: number[]) => ({
        get: async () => {
          queries.push(ids);
          return {
            docs: Object.entries(docs)
              .filter(([, d]) => (d.characterIds as number[]).some((c) => ids.includes(c)))
              .map(([id, d]) => ({ id, data: () => d })),
          };
        },
      }),
    }),
  };
  return { db: db as unknown as Firestore, queries, update, remove };
}

describe('firestoreNearbyStore', () => {
  it('reads each device once with its choices and stored state, querying 30 ids at a time', async () => {
    const { db, queries } = fakeDb({
      phone: {
        fcmToken: 'fcm',
        characterIds: [1, 2],
        serverEventsByCharacter: { '1': ['incursionNearby'] },
        serverInputsByCharacter: { '1': { incursionNearbyJumps: 5, shipLostMinimumIsk: 0 } },
        routeRules: { preference: 'shortest', securityPenalty: 50, avoid: [] },
        nearbyState: { characters: { '1': {} }, pushed: { k: 9, junk: 'x' } },
      },
      // No token: skipped.
      broken: { characterIds: [1] },
    });
    const ids = Array.from({ length: 31 }, (_, i) => i + 1);
    const devices = await firestoreNearbyStore(db).devicesFor(ids);
    expect(queries.map((q) => q.length)).toEqual([30, 1]);
    expect(devices).toEqual([
      {
        deviceId: 'phone',
        fcmToken: 'fcm',
        characterIds: [1, 2],
        serverEventsByCharacter: { '1': ['incursionNearby'] },
        nearbyJumpsByCharacter: { '1': { incursionNearby: 5 } },
        routeRules: { preference: 'shortest', securityPenalty: 50, avoid: [] },
        quietHours: undefined,
        state: { characters: { '1': {} }, pushed: { k: 9 } },
      },
    ]);
  });

  it('reads a registration from an older client as wanting nothing', async () => {
    const { db } = fakeDb({ old: { fcmToken: 'fcm', characterIds: [1] } });
    const [device] = await firestoreNearbyStore(db).devicesFor([1]);
    expect(device).toMatchObject({
      serverEventsByCharacter: {},
      nearbyJumpsByCharacter: {},
      state: { characters: {}, pushed: {} },
    });
  });

  it('writes only nearbyState, with update so a deleted registration stays deleted', async () => {
    const { db, update } = fakeDb({});
    const state = { characters: {}, pushed: {} };
    await firestoreNearbyStore(db).writeState('phone', state);
    expect(update).toHaveBeenCalledWith('phone', { nearbyState: state });
  });
});

describe('forgetNearbyCharacter', () => {
  it('deletes only that Character’s entry, only on docs that hold one', async () => {
    const updates: [string, unknown][] = [];
    const docs = [
      { id: 'a', data: { nearbyState: { characters: { '7': {}, '8': {} } } } },
      { id: 'b', data: { nearbyState: { characters: { '8': {} } } } },
    ];
    const db = {
      collection: () => ({
        where: () => ({
          get: async () => ({
            docs: docs.map((d) => ({
              id: d.id,
              data: () => d.data,
              ref: { update: async (v: unknown) => void updates.push([d.id, v]) },
            })),
          }),
        }),
      }),
    } as unknown as Firestore;
    await forgetNearbyCharacter(db, 7);
    expect(updates.map(([id, v]) => [id, Object.keys(v as object)])).toEqual([
      ['a', ['nearbyState.characters.7']],
    ]);
  });
});
