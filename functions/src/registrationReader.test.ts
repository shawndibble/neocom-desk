import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createRegistrationReader, registeredAtMs } from './registrationReader.js';
import { ALERTS_POLL_STATS_KEYS, createRunStats } from './runStats.js';

function fakeDb(docs: Record<string, Record<string, unknown>>) {
  const queries: number[][] = [];
  const db = {
    collection: () => ({
      where: (_f: string, _op: string, ids: number[]) => ({
        get: async () => {
          queries.push(ids);
          const found = Object.entries(docs)
            .filter(([, d]) => (d.characterIds as number[]).some((c) => ids.includes(c)))
            .map(([id, d]) => ({ id, data: () => d }));
          return { docs: found };
        },
      }),
    }),
  } as unknown as Firestore;
  return { db, queries };
}

describe('createRegistrationReader', () => {
  it('queries a Character once per run and serves later asks from the first read', async () => {
    const { db, queries } = fakeDb({
      a: { characterIds: [1, 2] },
      b: { characterIds: [2] },
    });
    const stats = createRunStats(ALERTS_POLL_STATS_KEYS);
    const reader = createRegistrationReader(db, stats);
    expect((await reader.holding([1, 2])).map((d) => d.id).sort()).toEqual(['a', 'b']);
    expect((await reader.holding([1])).map((d) => d.id)).toEqual(['a']);
    expect(queries).toHaveLength(1);
    expect(stats.get('firestoreReads')).toBe(2);
  });

  it('does not offer a registration deleted meanwhile', async () => {
    const { db } = fakeDb({ a: { characterIds: [1] } });
    const reader = createRegistrationReader(db);
    await reader.holding([1]);
    reader.forget('a');
    expect(await reader.holding([1])).toEqual([]);
  });
});

describe('registeredAtMs', () => {
  it('reads a Firestore timestamp, a number, or nothing', () => {
    expect(registeredAtMs({ updatedAt: { toMillis: () => 5 } })).toBe(5);
    expect(registeredAtMs({ updatedAt: 7 })).toBe(7);
    expect(registeredAtMs({})).toBeNull();
  });
});
