import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import {
  createAssignment,
  deleteAssignment,
  dismissEntry,
  markAssignmentsPaid,
  resolveNeedsReview,
  updateAssignment,
} from './assignments';

const syncMock = vi.hoisted(() => ({
  markMiningTaxAssignmentDeleted: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));
vi.mock('@/sync', () => syncMock);

const pricingMock = vi.hoisted(() => ({ loadJitaUnitPrices: vi.fn() }));
vi.mock('./pricing', () => pricingMock);

const CHAR_A = 1;
const TYPE_A = 45490;
const TYPE_B = 45491;

beforeEach(async () => {
  vi.clearAllMocks();
  await db.miningTaxAssignments.clear();
  pricingMock.loadJitaUnitPrices.mockResolvedValue(
    new Map([
      [TYPE_A, 10],
      [TYPE_B, 4],
    ])
  );
});

describe('createAssignment', () => {
  it('persists exactly the value/tax the caller supplies, without recomputing them', async () => {
    const assignment = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      markPaid: false,
    });

    expect(assignment.estimatedValue).toBe(1000);
    expect(assignment.taxOwed).toBe(100);
    expect(assignment.status).toBe('outstanding');
    expect(assignment.paidAt).toBeUndefined();
    expect(await db.miningTaxAssignments.get(assignment.id)).toEqual(assignment);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
    // No internal price lookup — the Assign dialog already resolved (and
    // possibly corrected) the value before calling this.
    expect(pricingMock.loadJitaUnitPrices).not.toHaveBeenCalled();
  });

  it('stores a pilot-corrected value verbatim, even when it disagrees with the Jita price', async () => {
    const assignment = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 4200, // not what TYPE_A's price would compute to
      taxOwed: 420,
      markPaid: false,
    });

    expect(assignment.estimatedValue).toBe(4200);
    expect(assignment.taxOwed).toBe(420);
  });

  it('marks paid immediately when markPaid is true, stamping paidAt', async () => {
    const assignment = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      markPaid: true,
    });

    expect(assignment.status).toBe('paid');
    expect(assignment.paidAt).toBeDefined();
  });
});

describe('updateAssignment', () => {
  it('overwrites payeeId/taxPct/estimatedValue/taxOwed, leaving oreLines, status and paidAt untouched', async () => {
    const assignment = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      markPaid: true,
    });
    vi.clearAllMocks();

    const updated = await updateAssignment(assignment, {
      payeeId: 'payee-2',
      taxPct: 15,
      estimatedValue: 1200,
      taxOwed: 180,
    });

    expect(updated.payeeId).toBe('payee-2');
    expect(updated.taxPct).toBe(15);
    expect(updated.estimatedValue).toBe(1200);
    expect(updated.taxOwed).toBe(180);
    expect(updated.oreLines).toEqual(assignment.oreLines);
    expect(updated.status).toBe('paid');
    expect(updated.paidAt).toBe(assignment.paidAt);
    expect(await db.miningTaxAssignments.get(assignment.id)).toEqual(updated);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });
});

describe('dismissEntry', () => {
  it('creates a payee-less, zero-tax Assignment with status dismissed', async () => {
    const dismissed = await dismissEntry({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      estimatedValue: 1000,
    });

    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.payeeId).toBeUndefined();
    expect(dismissed.taxPct).toBe(0);
    expect(dismissed.taxOwed).toBe(0);
    expect(dismissed.estimatedValue).toBe(1000);
    expect(await db.miningTaxAssignments.get(dismissed.id)).toEqual(dismissed);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });
});

describe('markAssignmentsPaid', () => {
  it('marks every given assignment paid and schedules a sync per distinct character', async () => {
    const a = await createAssignment({
      characterId: 1,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 100,
      taxOwed: 10,
      markPaid: false,
    });
    const b = await createAssignment({
      characterId: 2,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 100,
      taxOwed: 10,
      markPaid: false,
    });
    vi.clearAllMocks();

    await markAssignmentsPaid([a, b]);

    expect((await db.miningTaxAssignments.get(a.id))?.status).toBe('paid');
    expect((await db.miningTaxAssignments.get(b.id))?.status).toBe('paid');
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(1);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(2);
  });

  it('is a no-op for an empty list', async () => {
    await markAssignmentsPaid([]);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('deleteAssignment', () => {
  it('tombstones the deletion via markMiningTaxAssignmentDeleted', async () => {
    const assignment = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 100,
      taxOwed: 10,
      markPaid: false,
    });
    await deleteAssignment(assignment);
    expect(syncMock.markMiningTaxAssignmentDeleted).toHaveBeenCalledWith(CHAR_A, assignment.id);
  });

  it('undoes a dismissal the same way', async () => {
    const dismissed = await dismissEntry({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      oreLines: [{ typeId: TYPE_A, quantity: 10 }],
      estimatedValue: 100,
    });
    await deleteAssignment(dismissed);
    expect(syncMock.markMiningTaxAssignmentDeleted).toHaveBeenCalledWith(CHAR_A, dismissed.id);
  });
});

describe('resolveNeedsReview', () => {
  const freshEntry: MiningLedgerEntry = {
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    oreLines: [
      { typeId: TYPE_A, quantity: 150 },
      { typeId: TYPE_B, quantity: 999 }, // a brand-new type, never assigned before
    ],
  };

  it('as the sole Assignment, re-snapshots to the WHOLE fresh entry, including a brand-new type', async () => {
    const assignment: MiningTaxAssignmentRecord = {
      id: 'a1',
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      status: 'needs-review',
      reviewDiff: [{ typeId: TYPE_A, before: 100, after: 150 }],
      updatedAt: 1,
    };
    await db.miningTaxAssignments.put(assignment);

    await resolveNeedsReview(assignment, freshEntry, 1);

    const updated = await db.miningTaxAssignments.get('a1');
    expect(updated?.oreLines).toEqual([
      { typeId: TYPE_A, quantity: 150 },
      { typeId: TYPE_B, quantity: 999 },
    ]);
    expect(updated?.estimatedValue).toBe(1500 + 999 * 4); // 150*10 + 999*4
    expect(updated?.status).toBe('outstanding');
    expect(updated?.reviewDiff).toBeUndefined();
  });

  it('as one of a split entry’s Assignments, re-snapshots only to the types it already claimed', async () => {
    const assignment: MiningTaxAssignmentRecord = {
      id: 'a1',
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      status: 'needs-review',
      reviewDiff: [{ typeId: TYPE_A, before: 100, after: 150 }],
      updatedAt: 1,
    };
    await db.miningTaxAssignments.put(assignment);

    await resolveNeedsReview(assignment, freshEntry, 2);

    const updated = await db.miningTaxAssignments.get('a1');
    expect(updated?.oreLines).toEqual([{ typeId: TYPE_A, quantity: 150 }]);
    expect(updated?.estimatedValue).toBe(1500); // 150 * 10
    expect(updated?.taxOwed).toBe(150);
  });

  it('reverts to outstanding (and clears paidAt) even when the assignment had been paid', async () => {
    const assignment: MiningTaxAssignmentRecord = {
      id: 'a2',
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      status: 'needs-review',
      reviewDiff: [{ typeId: TYPE_A, before: 100, after: 150 }],
      paidAt: 5,
      updatedAt: 1,
    };
    await db.miningTaxAssignments.put(assignment);

    await resolveNeedsReview(assignment, freshEntry, 1);

    const updated = await db.miningTaxAssignments.get('a2');
    expect(updated?.status).toBe('outstanding');
    expect(updated?.paidAt).toBeUndefined();
  });
});
