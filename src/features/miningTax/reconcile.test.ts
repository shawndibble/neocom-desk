import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { reconcileAssignments } from './reconcile';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const assignmentsMock = vi.hoisted(() => ({ planNeedsReviewResolution: vi.fn() }));
vi.mock('./assignments', () => assignmentsMock);

const CHAR_A = 1;
const TYPE_A = 45490;
const TYPE_B = 45491;

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'p',
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  // A stand-in re-snapshot: what matters here is that reconcile writes
  // whatever the plan returns, in its own one write.
  assignmentsMock.planNeedsReviewResolution.mockImplementation(
    async (a: MiningTaxAssignmentRecord) => ({ ...a, estimatedValue: 1500, updatedAt: 2 })
  );
  await db.miningTaxAssignments.clear();
});

describe('reconcileAssignments', () => {
  it('does nothing when there are no assignments', async () => {
    await reconcileAssignments(CHAR_A, []);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('leaves an assignment alone when the fresh entry matches exactly', async () => {
    await db.miningTaxAssignments.put(assignment());
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('outstanding');
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('flips to needs-review with an explicit diff when ESI reports more ore on a dismissed entry', async () => {
    await db.miningTaxAssignments.put(
      assignment({ status: 'dismissed', payeeId: undefined, taxPct: 0, taxOwed: 0 })
    );
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 150 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    const updated = await db.miningTaxAssignments.get('a1');
    expect(updated?.status).toBe('needs-review');
    expect(updated?.reviewDiff).toEqual([{ typeId: TYPE_A, before: 100, after: 150 }]);
    // The stored snapshot itself is untouched — only status/reviewDiff moved.
    expect(updated?.oreLines).toEqual([{ typeId: TYPE_A, quantity: 100 }]);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A, {
      collections: ['miningTaxAssignments'],
    });
    expect(assignmentsMock.planNeedsReviewResolution).not.toHaveBeenCalled();
  });

  it('auto-absorbs growth on an unpaid (outstanding) assignment instead of flagging it', async () => {
    const outstanding = assignment();
    await db.miningTaxAssignments.put(outstanding);
    const entry: MiningLedgerEntry = {
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      oreLines: [{ typeId: TYPE_A, quantity: 150 }],
    };

    await reconcileAssignments(CHAR_A, [entry]);

    expect(assignmentsMock.planNeedsReviewResolution).toHaveBeenCalledTimes(1);
    expect(assignmentsMock.planNeedsReviewResolution).toHaveBeenCalledWith(outstanding, entry, [
      outstanding,
    ]);
    // The planned re-snapshot is what lands — reconcile itself never flags it.
    const stored = await db.miningTaxAssignments.get('a1');
    expect(stored?.status).toBe('outstanding');
    expect(stored?.estimatedValue).toBe(1500);
    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(1);
  });

  it('flags instead when the absorb itself fails (e.g. prices unavailable)', async () => {
    assignmentsMock.planNeedsReviewResolution.mockRejectedValue(new Error('offline'));
    await db.miningTaxAssignments.put(assignment());

    await reconcileAssignments(CHAR_A, [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 150 }],
      },
    ]);

    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('needs-review');
  });

  it('auto-absorbs growth on an unpaid member of a combined entry too', async () => {
    // A session that crossed midnight UTC is combined while still mining —
    // the second day keeps growing, and an unpaid bill has nothing to protect.
    const member = assignment({ groupId: 'g1' });
    await db.miningTaxAssignments.put(member);
    const entry: MiningLedgerEntry = {
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      oreLines: [{ typeId: TYPE_A, quantity: 150 }],
    };

    await reconcileAssignments(CHAR_A, [entry]);

    expect(assignmentsMock.planNeedsReviewResolution).toHaveBeenCalledWith(member, entry, [member]);
    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('outstanding');
  });

  it('leaves a paid member of a combined entry paid when its day grows', async () => {
    const member = assignment({ groupId: 'g1', status: 'paid', paidAt: 1 });
    await db.miningTaxAssignments.put(member);

    await reconcileAssignments(CHAR_A, [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 150 }],
      },
    ]);

    expect(assignmentsMock.planNeedsReviewResolution).not.toHaveBeenCalled();
    expect(await db.miningTaxAssignments.get('a1')).toEqual(member);
  });

  it('leaves a paid assignment exactly as it was when its ore grows (paid stays paid, ADR 0024)', async () => {
    const paid = assignment({ status: 'paid', paidAt: 5 });
    await db.miningTaxAssignments.put(paid);
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 200 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    // Status, ore and tax all stay as paid; the 100 extra units are left
    // unowned, which the Tax tab shows as a new, separately assignable row.
    expect(await db.miningTaxAssignments.get('a1')).toEqual(paid);
    expect(assignmentsMock.planNeedsReviewResolution).not.toHaveBeenCalled();
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('leaves the assignment alone when its entry has aged out of the fresh read', async () => {
    await db.miningTaxAssignments.put(assignment());
    await reconcileAssignments(CHAR_A, []);
    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('outstanding');
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('does not re-write (or re-sync) an assignment already needs-review with the identical diff', async () => {
    await db.miningTaxAssignments.put(
      assignment({
        status: 'needs-review',
        reviewDiff: [{ typeId: TYPE_A, before: 100, after: 150 }],
      })
    );
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 150 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('re-writes when a needs-review assignment grows again with a new diff', async () => {
    await db.miningTaxAssignments.put(
      assignment({
        status: 'needs-review',
        reviewDiff: [{ typeId: TYPE_A, before: 100, after: 150 }],
      })
    );
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 200 }],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    expect((await db.miningTaxAssignments.get('a1'))?.reviewDiff).toEqual([
      { typeId: TYPE_A, before: 100, after: 200 },
    ]);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A, {
      collections: ['miningTaxAssignments'],
    });
  });

  it('folds a brand-new ore type into the sole Assignment for that entry (a continuous mining session)', async () => {
    await db.miningTaxAssignments.put(
      assignment({ status: 'dismissed', payeeId: undefined, taxPct: 0, taxOwed: 0 })
    ); // covers only TYPE_A
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [
          { typeId: TYPE_A, quantity: 100 }, // unchanged
          { typeId: TYPE_B, quantity: 40 }, // never assigned before
        ],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    const updated = await db.miningTaxAssignments.get('a1');
    expect(updated?.status).toBe('needs-review');
    expect(updated?.reviewDiff).toEqual([{ typeId: TYPE_B, before: 0, after: 40 }]);
  });

  it('does NOT fold a brand-new ore type into either Assignment when the entry is split across two', async () => {
    await db.miningTaxAssignments.put(assignment({ id: 'a1', payeeId: 'p1' })); // covers TYPE_A
    await db.miningTaxAssignments.put(
      assignment({
        id: 'a2',
        payeeId: 'p2',
        oreLines: [{ typeId: TYPE_B, quantity: 20 }],
      })
    ); // covers TYPE_B
    const TYPE_C = 45492;
    const fresh: MiningLedgerEntry[] = [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [
          { typeId: TYPE_A, quantity: 100 },
          { typeId: TYPE_B, quantity: 20 },
          { typeId: TYPE_C, quantity: 5 }, // belongs to neither Payee
        ],
      },
    ];

    await reconcileAssignments(CHAR_A, fresh);

    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('outstanding');
    expect((await db.miningTaxAssignments.get('a2'))?.status).toBe('outstanding');
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
  it('leaves both sides of a split alone when its paid collector grows', async () => {
    const kept = assignment({
      id: 'a1',
      payeeId: 'p1',
      status: 'paid',
      paidAt: 5,
      collectsGrowth: true,
    });
    const moved = assignment({
      id: 'a2',
      payeeId: 'p2',
      oreLines: [{ typeId: TYPE_A, quantity: 40 }],
    });
    await db.miningTaxAssignments.bulkPut([kept, moved]);

    await reconcileAssignments(CHAR_A, [
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [
          { typeId: TYPE_A, quantity: 170 },
          { typeId: TYPE_B, quantity: 10 },
        ],
      },
    ]);

    // The growth is the paid side's, which is frozen, so it stays unassigned
    // rather than being absorbed by the unpaid side.
    expect(await db.miningTaxAssignments.get('a1')).toEqual(kept);
    expect(await db.miningTaxAssignments.get('a2')).toEqual(moved);
    expect(assignmentsMock.planNeedsReviewResolution).not.toHaveBeenCalled();
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it("absorbs growth into the unpaid entry made from a paid day's late ore", async () => {
    const paid = assignment({ id: 'a1', status: 'paid', paidAt: 5 });
    const after = assignment({
      id: 'a2',
      oreLines: [{ typeId: TYPE_A, quantity: 50 }],
      collectsGrowth: true,
    });
    await db.miningTaxAssignments.bulkPut([paid, after]);
    const entry: MiningLedgerEntry = {
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      oreLines: [{ typeId: TYPE_A, quantity: 180 }],
    };

    await reconcileAssignments(CHAR_A, [entry]);

    expect(assignmentsMock.planNeedsReviewResolution).toHaveBeenCalledTimes(1);
    expect(assignmentsMock.planNeedsReviewResolution).toHaveBeenCalledWith(
      after,
      entry,
      expect.arrayContaining([paid, after])
    );
    expect(await db.miningTaxAssignments.get('a1')).toEqual(paid);
  });
});
