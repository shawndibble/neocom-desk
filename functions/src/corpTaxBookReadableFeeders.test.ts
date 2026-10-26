import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { readableFeeders } from './corpTaxBookFeederSync.js';

const snap = (path: string, data: Record<string, unknown>) => ({
  id: path.split('/').pop(),
  ref: { path, parent: { parent: { id: path.split('/')[1] } } },
  data: () => data,
});

function fakeDb(group: () => Promise<{ docs: unknown[] }>, pointers: unknown[] = []) {
  const wheres: unknown[][] = [];
  const db = {
    collectionGroup: () => ({
      where: (...args: unknown[]) => {
        wheres.push(args);
        return { get: group };
      },
    }),
    collection: () => ({ get: async () => ({ docs: pointers }) }),
  } as unknown as Firestore;
  return { db, wheres };
}

describe('readableFeeders', () => {
  it('queries only readable statuses and keeps top-level book feeders', async () => {
    const { db, wheres } = fakeDb(async () => ({
      docs: [
        snap('corps/98000001/feeders/98000002', { status: 'active' }),
        snap('elsewhere/1/feeders/2', { status: 'active' }),
      ],
    }));
    const found = await readableFeeders(db, 'corpTaxBookFeederOf', () => undefined);
    expect(wheres).toEqual([['status', 'in', ['active', 'pending-removal']]]);
    expect(found).toEqual([
      {
        feederCorporationId: 98000002,
        collectorCorporationId: 98000001,
        record: { status: 'active' },
      },
    ]);
  });

  it('falls back to the pointer scan while the index is not deployed', async () => {
    const logged: string[] = [];
    const { db } = fakeDb(async () => {
      throw Object.assign(new Error('index'), { code: 9 });
    }, [{ id: '98000002', get: () => 98000001 }]);
    const found = await readableFeeders(db, 'corpTaxBookFeederOf', (m) => logged.push(m));
    expect(found).toEqual([{ feederCorporationId: 98000002, collectorCorporationId: 98000001 }]);
    expect(logged).toHaveLength(1);
  });

  it('rethrows any other query failure', async () => {
    const { db } = fakeDb(async () => {
      throw new Error('boom');
    });
    await expect(readableFeeders(db, 'x', () => undefined)).rejects.toThrow('boom');
  });
});
