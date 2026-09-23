import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { coalesceAssignments } from './coalesce';

const syncMock = vi.hoisted(() => ({
  scheduleSync: vi.fn(),
  markMiningTaxAssignmentDeleted: vi.fn(async (_characterId: number, assignmentId: string) => {
    await db.miningTaxAssignments.delete(assignmentId);
  }),
}));
vi.mock('@/sync', () => syncMock);

const CHAR_A = 1;
const TYPE_A = 45490;
const TYPE_B = 45491;

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: CHAR_A,
    date: '2026-09-12',
    solarSystemId: 1,
    payeeId: 'p',
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
    taxPct: 5,
    estimatedValue: 1000,
    taxOwed: 50,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.miningTaxAssignments.clear();
});

describe('coalesceAssignments', () => {
  it('does nothing for a character with no Assignments', async () => {
    await coalesceAssignments(CHAR_A);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('leaves a healthy ledger untouched', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', groupId: 'g1' }),
      assignment({ id: 'a2', groupId: 'g1', date: '2026-09-13' }),
    ]);

    await coalesceAssignments(CHAR_A);

    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
    const stored = await db.miningTaxAssignments.toArray();
    expect(stored.map((a) => a.groupId)).toEqual(['g1', 'g1']);
  });

  it('fuses two halves of one day back into a single Assignment', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({
        id: 'a1',
        groupId: 'g1',
        oreLines: [{ typeId: TYPE_A, quantity: 8380 }],
        estimatedValue: 29_914_117,
        taxOwed: 1_495_706,
      }),
      assignment({
        id: 'a2',
        groupId: 'g1',
        oreLines: [
          { typeId: TYPE_A, quantity: 13_530 },
          { typeId: TYPE_B, quantity: 4904 },
        ],
        estimatedValue: 27_055_176,
        taxOwed: 1_352_759,
      }),
      assignment({ id: 'a3', groupId: 'g1', date: '2026-09-13' }),
    ]);

    await coalesceAssignments(CHAR_A);

    const stored = await db.miningTaxAssignments.orderBy('id').toArray();
    expect(stored.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(stored[0].oreLines).toEqual([
      { typeId: TYPE_A, quantity: 21_910 },
      { typeId: TYPE_B, quantity: 4904 },
    ]);
    expect(stored[0].estimatedValue).toBe(56_969_293);
    expect(stored[0].taxOwed).toBe(2_848_465);
    // Still a real group: the fused day plus the next one.
    expect(stored[0].groupId).toBe('g1');
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });

  it('keeps a genuine split to a second Payee apart', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1' }),
      assignment({ id: 'a2', payeeId: 'p2', oreLines: [{ typeId: TYPE_B, quantity: 7 }] }),
    ]);

    await coalesceAssignments(CHAR_A);

    expect(await db.miningTaxAssignments.count()).toBe(2);
  });

  it('ejects a member whose Payee was edited away from its group', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', groupId: 'g1' }),
      assignment({ id: 'a2', groupId: 'g1', date: '2026-09-13' }),
      assignment({ id: 'a3', groupId: 'g1', date: '2026-09-14', payeeId: 'p2' }),
    ]);

    await coalesceAssignments(CHAR_A);

    const stored = await db.miningTaxAssignments.orderBy('id').toArray();
    expect(stored.map((a) => a.groupId)).toEqual(['g1', 'g1', undefined]);
  });

  it('dissolves a group whose two members no longer agree, without fusing them', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', groupId: 'g1' }),
      assignment({ id: 'a2', groupId: 'g1', payeeId: 'p2' }),
    ]);

    await coalesceAssignments(CHAR_A);

    const stored = await db.miningTaxAssignments.orderBy('id').toArray();
    expect(stored).toHaveLength(2);
    expect(stored.map((a) => a.groupId)).toEqual([undefined, undefined]);
  });

  it('fuses two halves left ungrouped once their group dissolved', async () => {
    // Both ejected (the group falls below two members), then fused: one entry,
    // one Payee, one rate is one obligation however it got there.
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', groupId: 'g1' }),
      assignment({ id: 'a2', groupId: 'g1', oreLines: [{ typeId: TYPE_B, quantity: 7 }] }),
    ]);

    await coalesceAssignments(CHAR_A);

    const stored = await db.miningTaxAssignments.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('a1');
    expect(stored[0].groupId).toBeUndefined();
    expect(stored[0].oreLines).toEqual([
      { typeId: TYPE_A, quantity: 100 },
      { typeId: TYPE_B, quantity: 7 },
    ]);
  });

  it('never fuses a paid day, even on identical terms', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', status: 'paid', paidAt: 5 }),
      assignment({ id: 'a2', status: 'paid', paidAt: 5 }),
    ]);

    await coalesceAssignments(CHAR_A);

    expect(await db.miningTaxAssignments.count()).toBe(2);
  });

  it('carries the growth-collector flag on while a third Assignment still covers the entry', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1' }),
      assignment({ id: 'a2', collectsGrowth: true, oreLines: [{ typeId: TYPE_B, quantity: 7 }] }),
      assignment({ id: 'a3', payeeId: 'p2', oreLines: [{ typeId: TYPE_B, quantity: 3 }] }),
    ]);

    await coalesceAssignments(CHAR_A);

    const stored = await db.miningTaxAssignments.orderBy('id').toArray();
    expect(stored.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(stored[0].collectsGrowth).toBe(true);
  });

  it('drops the growth-collector flag once the fused record is alone on its entry', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', collectsGrowth: true }),
      assignment({ id: 'a2', oreLines: [{ typeId: TYPE_B, quantity: 7 }] }),
    ]);

    await coalesceAssignments(CHAR_A);

    const [stored] = await db.miningTaxAssignments.toArray();
    expect(stored.collectsGrowth).toBeUndefined();
  });

  it('fuses a half whose Payee was edited back onto the group it was ejected from', async () => {
    // The whole point of the repair: the pilot moves ore out, changes their
    // mind, and the day goes back to one line without a Combine step.
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', groupId: 'g1' }),
      assignment({ id: 'a2', oreLines: [{ typeId: TYPE_B, quantity: 7 }] }),
      assignment({ id: 'a3', groupId: 'g1', date: '2026-09-13' }),
    ]);

    await coalesceAssignments(CHAR_A);

    const stored = await db.miningTaxAssignments.orderBy('id').toArray();
    expect(stored.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(stored[0].groupId).toBe('g1');
    expect(stored[0].oreLines).toEqual([
      { typeId: TYPE_A, quantity: 100 },
      { typeId: TYPE_B, quantity: 7 },
    ]);
  });
});

describe('coalesceAssignments — exact duplicates', () => {
  const entry = {
    characterId: CHAR_A,
    date: '2026-09-12',
    solarSystemId: 1,
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
  };

  it('drops the extra of two identical Assignments instead of doubling the bill', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', estimatedValue: 1000, taxOwed: 50 }),
      assignment({ id: 'a2', estimatedValue: 1180, taxOwed: 59 }),
    ]);

    await coalesceAssignments(CHAR_A, [entry]);

    const stored = await db.miningTaxAssignments.toArray();
    expect(stored.map((a) => a.id)).toEqual(['a1']);
    expect(stored[0].oreLines).toEqual([{ typeId: TYPE_A, quantity: 100 }]);
    expect(stored[0].taxOwed).toBe(50);
    expect(syncMock.markMiningTaxAssignmentDeleted).toHaveBeenCalledWith(CHAR_A, 'a2');
  });

  it('leaves identical Assignments untouched when the entry is not in the ledger read', async () => {
    await db.miningTaxAssignments.bulkPut([assignment({ id: 'a1' }), assignment({ id: 'a2' })]);

    await coalesceAssignments(CHAR_A, []);

    expect(await db.miningTaxAssignments.count()).toBe(2);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('never touches paid duplicates', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', status: 'paid' }),
      assignment({ id: 'a2', status: 'paid' }),
    ]);

    await coalesceAssignments(CHAR_A, [entry]);

    expect(await db.miningTaxAssignments.count()).toBe(2);
  });
});
