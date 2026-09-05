import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import {
  createAssignment,
  deleteAssignment,
  markAssignmentsPaid,
  resolveNeedsReview,
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
  it('snapshots Jita price and tax into estimatedValue/taxOwed', async () => {
    const assignment = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      markPaid: false,
    });

    expect(assignment.estimatedValue).toBe(1000);
    expect(assignment.taxOwed).toBe(100);
    expect(assignment.status).toBe('outstanding');
    expect(assignment.paidAt).toBeUndefined();
    expect(await db.miningTaxAssignments.get(assignment.id)).toEqual(assignment);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });

  it('marks paid immediately when markPaid is true, stamping paidAt', async () => {
    const assignment = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      markPaid: true,
    });

    expect(assignment.status).toBe('paid');
    expect(assignment.paidAt).toBeDefined();
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
      markPaid: false,
    });
    const b = await createAssignment({
      characterId: 2,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 10 }],
      taxPct: 10,
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
      markPaid: false,
    });
    await deleteAssignment(assignment);
    expect(syncMock.markMiningTaxAssignmentDeleted).toHaveBeenCalledWith(CHAR_A, assignment.id);
  });
});

describe('resolveNeedsReview', () => {
  const freshEntry: MiningLedgerEntry = {
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    oreLines: [
      { typeId: TYPE_A, quantity: 150 },
      { typeId: TYPE_B, quantity: 999 }, // not covered by the assignment — must be ignored
    ],
  };

  it('re-snapshots oreLines/value/tax to the fresh totals and clears the review state', async () => {
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

    await resolveNeedsReview(assignment, freshEntry);

    const updated = await db.miningTaxAssignments.get('a1');
    expect(updated?.oreLines).toEqual([{ typeId: TYPE_A, quantity: 150 }]);
    expect(updated?.estimatedValue).toBe(1500); // 150 * 10
    expect(updated?.taxOwed).toBe(150);
    expect(updated?.status).toBe('outstanding');
    expect(updated?.reviewDiff).toBeUndefined();
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

    await resolveNeedsReview(assignment, freshEntry);

    const updated = await db.miningTaxAssignments.get('a2');
    expect(updated?.status).toBe('outstanding');
    expect(updated?.paidAt).toBeUndefined();
  });
});
