import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import {
  AlreadyAssignedError,
  createAssignment,
  deleteAssignment,
  dismissEntries,
  dismissEntry,
  joinAssignments,
  linkPaymentTransaction,
  linkRecordedPayment,
  markAssignmentsPaid,
  moveAssignmentsToPayee,
  resolveNeedsReview,
  splitAssignment,
  uncombineAssignments,
  unlinkPaymentTransaction,
  unlockPaidAssignment,
  updateAssignment,
  updateCombinedAssignments,
} from './assignments';

const syncMock = vi.hoisted(() => ({
  markMiningTaxAssignmentDeleted: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));
vi.mock('@/sync', () => syncMock);

// Only `loadUnitPricesOnDate` is stubbed: `hubForPayee` is pure hub lookup,
// and the point of these tests is *which* hub/date the real resolver hands
// the fetch.
const pricingMock = vi.hoisted(() => ({ loadUnitPricesOnDate: vi.fn() }));
vi.mock('./pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pricing')>()),
  loadUnitPricesOnDate: pricingMock.loadUnitPricesOnDate,
}));

const CHAR_A = 1;
const TYPE_A = 45490;
const TYPE_B = 45491;

beforeEach(async () => {
  vi.clearAllMocks();
  await db.miningTaxAssignments.clear();
  await db.payees.clear();
  pricingMock.loadUnitPricesOnDate.mockResolvedValue({
    prices: new Map([
      [TYPE_A, 10],
      [TYPE_B, 4],
    ]),
    unpriced: new Set<number>(),
  });
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
    expect(pricingMock.loadUnitPricesOnDate).not.toHaveBeenCalled();
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
  async function grouped() {
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
    const joined = { ...assignment, groupId: 'g1' };
    await db.miningTaxAssignments.put(joined);
    vi.clearAllMocks();
    return joined;
  }

  it('ejects a joined member from its group when its Payee changes', async () => {
    const joined = await grouped();

    const updated = await updateAssignment(joined, {
      payeeId: 'payee-2',
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
    });

    expect(updated.groupId).toBeUndefined();
    expect((await db.miningTaxAssignments.get(joined.id))?.groupId).toBeUndefined();
  });

  it('ejects a joined member when only its tax rate changes', async () => {
    const joined = await grouped();

    const updated = await updateAssignment(joined, {
      payeeId: 'payee-1',
      taxPct: 15,
      estimatedValue: 1000,
      taxOwed: 150,
    });

    expect(updated.groupId).toBeUndefined();
  });

  it('keeps a joined member in its group when only the ISK figures are corrected', async () => {
    const joined = await grouped();

    const updated = await updateAssignment(joined, {
      payeeId: 'payee-1',
      taxPct: 10,
      estimatedValue: 1250,
      taxOwed: 125,
    });

    expect(updated.groupId).toBe('g1');
  });

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

  it('persists per-ore-type value overrides when given', async () => {
    const assignment = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [
        { typeId: TYPE_A, quantity: 100 },
        { typeId: TYPE_B, quantity: 50 },
      ],
      taxPct: 10,
      estimatedValue: 1200,
      taxOwed: 120,
      markPaid: false,
    });

    const updated = await updateAssignment(assignment, {
      payeeId: 'payee-1',
      taxPct: 10,
      estimatedValue: 1100,
      taxOwed: 110,
      oreLineValues: { [TYPE_A]: 900 },
    });

    expect(updated.oreLineValues).toEqual({ [TYPE_A]: 900 });
    expect((await db.miningTaxAssignments.get(assignment.id))?.oreLineValues).toEqual({
      [TYPE_A]: 900,
    });
  });

  it('clears any stored per-ore-type overrides when the input omits them', async () => {
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
    await updateAssignment(assignment, {
      payeeId: 'payee-1',
      taxPct: 10,
      estimatedValue: 900,
      taxOwed: 90,
      oreLineValues: { [TYPE_A]: 900 },
    });

    // Back to the "edit ore values individually" setting being off: the
    // Assign form's whole-row edit doesn't send oreLineValues at all.
    const reverted = await updateAssignment(assignment, {
      payeeId: 'payee-1',
      taxPct: 10,
      estimatedValue: 1100,
      taxOwed: 110,
    });

    expect(reverted.oreLineValues).toBeUndefined();
    expect((await db.miningTaxAssignments.get(assignment.id))?.oreLineValues).toBeUndefined();
  });
});

describe('unlockPaidAssignment', () => {
  it('reverts status to outstanding and clears paidAt, but keeps the recorded payment', async () => {
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
    await markAssignmentsPaid([assignment], {
      method: 'donation',
      amount: 1000,
      paidOn: '2026-09-05',
    });
    const paid = await db.miningTaxAssignments.get(assignment.id);
    vi.clearAllMocks();

    const unlocked = await unlockPaidAssignment(paid!);

    expect(unlocked.status).toBe('outstanding');
    expect(unlocked.paidAt).toBeUndefined();
    expect(unlocked.payment).toEqual(paid!.payment);
    expect(await db.miningTaxAssignments.get(assignment.id)).toEqual(unlocked);
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

describe('dismissEntries', () => {
  it('dismisses every entry at once, scheduling one sync per distinct character', async () => {
    const dismissed = await dismissEntries([
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 100 }],
        estimatedValue: 1000,
      },
      {
        characterId: CHAR_A,
        date: '2026-09-05',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_B, quantity: 50 }],
        estimatedValue: 200,
      },
      {
        characterId: 2,
        date: '2026-09-05',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 10 }],
        estimatedValue: 100,
      },
    ]);

    expect(dismissed).toHaveLength(3);
    expect(dismissed.every((d) => d.status === 'dismissed' && d.taxOwed === 0)).toBe(true);
    expect(await db.miningTaxAssignments.count()).toBe(3);
    // One schedule per character, not one per entry — a bulk dismiss of a
    // week's entries must not fire a week's worth of syncs.
    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(2);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(2);
  });

  it('writes nothing and schedules nothing for an empty list', async () => {
    expect(await dismissEntries([])).toEqual([]);
    expect(await db.miningTaxAssignments.count()).toBe(0);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
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

describe('linkRecordedPayment', () => {
  it('attaches a journal ref to a recorded payment, leaving every other field alone', async () => {
    const a = await createAssignment({
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
    await markAssignmentsPaid([a], {
      paidOn: '2026-09-06',
      method: 'donation',
      amount: 10,
    });
    const recorded = (await db.miningTaxAssignments.get(a.id)) as MiningTaxAssignmentRecord;
    vi.clearAllMocks();

    await linkRecordedPayment([recorded], { journalRefId: 42 });

    const updated = await db.miningTaxAssignments.get(a.id);
    expect(updated?.payment?.journalLinks).toEqual([{ refId: 42, source: 'auto' }]);
    expect(updated?.payment?.paidOn).toBe('2026-09-06');
    expect(updated?.payment?.method).toBe('donation');
    expect(updated?.payment?.amount).toBe(10);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });

  it('appends a second link rather than replacing the first — a lump sum paid in installments', async () => {
    const a = await createAssignment({
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
    await markAssignmentsPaid([a], { paidOn: '2026-09-06', method: 'donation', amount: 10 });
    const recorded = (await db.miningTaxAssignments.get(a.id)) as MiningTaxAssignmentRecord;
    await linkRecordedPayment([recorded], { journalRefId: 42 });
    const onceLinked = (await db.miningTaxAssignments.get(a.id)) as MiningTaxAssignmentRecord;

    await linkRecordedPayment([onceLinked], { journalRefId: 43 });

    const updated = await db.miningTaxAssignments.get(a.id);
    expect(updated?.payment?.journalLinks).toEqual([
      { refId: 42, source: 'auto' },
      { refId: 43, source: 'auto' },
    ]);
  });

  it('leaves an Assignment with no recorded payment untouched', async () => {
    const a = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 100,
      taxOwed: 10,
      markPaid: true,
    });

    await linkRecordedPayment([a], { journalRefId: 42 });

    expect((await db.miningTaxAssignments.get(a.id))?.payment).toBeUndefined();
  });

  it('is a no-op for an empty list', async () => {
    await linkRecordedPayment([], { journalRefId: 1 });
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('linkPaymentTransaction', () => {
  async function paidAssignment(
    payment?: Parameters<typeof markAssignmentsPaid>[1],
    date = '2026-09-04'
  ) {
    const a = await createAssignment({
      characterId: CHAR_A,
      date,
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 100,
      taxOwed: 10,
      markPaid: false,
    });
    await markAssignmentsPaid([a], payment);
    return (await db.miningTaxAssignments.get(a.id)) as MiningTaxAssignmentRecord;
  }

  it('attaches a manually-picked transaction to an already-recorded payment', async () => {
    const recorded = await paidAssignment({ paidOn: '2026-09-06', method: 'donation', amount: 10 });

    await linkPaymentTransaction([recorded], { journalRefId: 42 }, 'manual', {
      paidOn: '2026-09-06',
      method: 'donation',
      amount: 10,
    });

    const updated = await db.miningTaxAssignments.get(recorded.id);
    expect(updated?.payment?.journalLinks).toEqual([{ refId: 42, source: 'manual' }]);
    expect(updated?.payment?.paymentId).toBe(recorded.payment?.paymentId);
  });

  it('creates a minimal payment from the fallback when the row was just marked paid, no Settle-up record', async () => {
    const bare = await paidAssignment();
    expect(bare.payment).toBeUndefined();

    await linkPaymentTransaction([bare], { journalRefId: 99 }, 'auto', {
      paidOn: '2026-09-07',
      method: 'donation',
      amount: 500,
    });

    const updated = await db.miningTaxAssignments.get(bare.id);
    expect(updated?.payment?.paidOn).toBe('2026-09-07');
    expect(updated?.payment?.amount).toBe(500);
    expect(updated?.payment?.journalLinks).toEqual([{ refId: 99, source: 'auto' }]);
  });

  it('shares one freshly-minted paymentId across several bare-paid assignments (a joined group), not one each', async () => {
    const first = await paidAssignment(undefined, '2026-09-04');
    const second = await paidAssignment(undefined, '2026-09-05');
    expect(first.payment).toBeUndefined();
    expect(second.payment).toBeUndefined();

    await linkPaymentTransaction([first, second], { journalRefId: 7 }, 'manual', {
      paidOn: '2026-09-08',
      method: 'donation',
      amount: 20,
    });

    const [updatedFirst, updatedSecond] = await Promise.all([
      db.miningTaxAssignments.get(first.id),
      db.miningTaxAssignments.get(second.id),
    ]);
    expect(updatedFirst?.payment?.paymentId).toBeDefined();
    expect(updatedFirst?.payment?.paymentId).toBe(updatedSecond?.payment?.paymentId);
    expect(updatedSecond?.payment?.journalLinks).toEqual([{ refId: 7, source: 'manual' }]);
  });

  it('leaves an assignment that already had its own payment on its own paymentId, not the newly-minted shared one', async () => {
    const alreadyPaid = await paidAssignment(
      { paidOn: '2026-09-05', method: 'donation', amount: 5 },
      '2026-09-04'
    );
    const bare = await paidAssignment(undefined, '2026-09-05');

    await linkPaymentTransaction([alreadyPaid, bare], { journalRefId: 8 }, 'manual', {
      paidOn: '2026-09-08',
      method: 'donation',
      amount: 20,
    });

    const [updatedFirst, updatedSecond] = await Promise.all([
      db.miningTaxAssignments.get(alreadyPaid.id),
      db.miningTaxAssignments.get(bare.id),
    ]);
    expect(updatedFirst?.payment?.paymentId).toBe(alreadyPaid.payment?.paymentId);
    expect(updatedSecond?.payment?.paymentId).not.toBe(alreadyPaid.payment?.paymentId);
  });

  it('never recomputes amount/paidOn when a payment already exists', async () => {
    const recorded = await paidAssignment({ paidOn: '2026-09-06', method: 'donation', amount: 10 });

    await linkPaymentTransaction([recorded], { journalRefId: 42 }, 'manual', {
      paidOn: '2099-01-01',
      method: 'other',
      amount: 999_999,
    });

    const updated = await db.miningTaxAssignments.get(recorded.id);
    expect(updated?.payment?.paidOn).toBe('2026-09-06');
    expect(updated?.payment?.amount).toBe(10);
  });

  it('is a no-op for an empty list', async () => {
    await linkPaymentTransaction([], { journalRefId: 1 }, 'manual', {
      paidOn: '2026-09-06',
      method: 'donation',
      amount: 1,
    });
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('unlinkPaymentTransaction', () => {
  it('removes one linked transaction, leaving the rest of the payment intact', async () => {
    const a = await createAssignment({
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
    await markAssignmentsPaid([a], { paidOn: '2026-09-06', method: 'donation', amount: 10 });
    const recorded = (await db.miningTaxAssignments.get(a.id)) as MiningTaxAssignmentRecord;
    await linkRecordedPayment([recorded], { journalRefId: 42 });
    const linked = (await db.miningTaxAssignments.get(a.id)) as MiningTaxAssignmentRecord;
    await linkPaymentTransaction([linked], { journalRefId: 43 }, 'manual', {
      paidOn: '2026-09-06',
      method: 'donation',
      amount: 10,
    });
    const bothLinked = (await db.miningTaxAssignments.get(a.id)) as MiningTaxAssignmentRecord;

    await unlinkPaymentTransaction([bothLinked], { journalRefId: 42 });

    const updated = await db.miningTaxAssignments.get(a.id);
    expect(updated?.payment?.journalLinks).toEqual([{ refId: 43, source: 'manual' }]);
  });

  it('is a no-op for an Assignment with no payment', async () => {
    const a = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 100,
      taxOwed: 10,
      markPaid: true,
    });

    await unlinkPaymentTransaction([a], { journalRefId: 1 });

    expect((await db.miningTaxAssignments.get(a.id))?.payment).toBeUndefined();
  });

  it('is a no-op for an empty list', async () => {
    await unlinkPaymentTransaction([], { journalRefId: 1 });
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

describe('joinAssignments', () => {
  const prices = new Map([
    [TYPE_A, 10],
    [TYPE_B, 4],
  ]);

  it('creates one new Assignment per still-unassigned member, sharing a fresh groupId', async () => {
    const [a, b] = await joinAssignments(
      [
        {
          characterId: CHAR_A,
          date: '2026-09-04',
          solarSystemId: 1,
          assignment: null,
          oreLines: [{ typeId: TYPE_A, quantity: 100 }],
        },
        {
          characterId: CHAR_A,
          date: '2026-09-05',
          solarSystemId: 1,
          assignment: null,
          oreLines: [{ typeId: TYPE_B, quantity: 50 }],
        },
      ],
      'payee-1',
      10,
      () => prices
    );

    expect(a.groupId).toBeDefined();
    expect(a.groupId).toBe(b.groupId);
    expect(a.payeeId).toBe('payee-1');
    expect(a.taxPct).toBe(10);
    expect(a.estimatedValue).toBe(1000); // 100 * 10
    expect(a.taxOwed).toBe(100);
    expect(b.estimatedValue).toBe(200); // 50 * 4
    expect(b.taxOwed).toBe(20);
    expect(await db.miningTaxAssignments.get(a.id)).toEqual(a);
    expect(await db.miningTaxAssignments.get(b.id)).toEqual(b);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });

  it("prices each still-unassigned member at its OWN mined date, not a shared one (a join's whole point is combining different dates)", async () => {
    const pricesByDate = new Map([
      ['2026-09-04', new Map([[TYPE_A, 10]])],
      ['2026-09-05', new Map([[TYPE_A, 40]])],
    ]);
    const pricesOn = vi.fn((date: string) => pricesByDate.get(date) ?? new Map());

    const [a, b] = await joinAssignments(
      [
        {
          characterId: CHAR_A,
          date: '2026-09-04',
          solarSystemId: 1,
          assignment: null,
          oreLines: [{ typeId: TYPE_A, quantity: 100 }],
        },
        {
          characterId: CHAR_A,
          date: '2026-09-05',
          solarSystemId: 1,
          assignment: null,
          oreLines: [{ typeId: TYPE_A, quantity: 100 }],
        },
      ],
      'payee-1',
      10,
      pricesOn
    );

    expect(pricesOn).toHaveBeenCalledWith('2026-09-04');
    expect(pricesOn).toHaveBeenCalledWith('2026-09-05');
    // Same type, same quantity, two different mined dates — a shared price
    // would give these the same value. A per-date one must not.
    expect(a.estimatedValue).toBe(1000); // 100 * 10
    expect(b.estimatedValue).toBe(4000); // 100 * 40
  });

  it('tags an already-assigned member with the shared groupId, leaving its own fields untouched', async () => {
    const existing = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      markPaid: false,
    });

    const [taggedExisting, created] = await joinAssignments(
      [
        { characterId: CHAR_A, date: '2026-09-04', solarSystemId: 1, assignment: existing },
        {
          characterId: CHAR_A,
          date: '2026-09-05',
          solarSystemId: 1,
          assignment: null,
          oreLines: [{ typeId: TYPE_B, quantity: 50 }],
        },
      ],
      existing.payeeId as string,
      existing.taxPct,
      () => prices
    );

    expect(taggedExisting.groupId).toBeDefined();
    expect(taggedExisting.groupId).toBe(created.groupId);
    expect(taggedExisting.estimatedValue).toBe(1000);
    expect(taggedExisting.taxOwed).toBe(100);
    expect(taggedExisting.oreLines).toEqual(existing.oreLines);
    expect(created.payeeId).toBe('payee-1');
    expect(created.estimatedValue).toBe(200);
  });

  it('reuses an already-set groupId instead of minting a second one', async () => {
    const existing = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      markPaid: false,
    });
    await db.miningTaxAssignments.put({ ...existing, groupId: 'existing-group' });

    const [, created] = await joinAssignments(
      [
        {
          characterId: CHAR_A,
          date: '2026-09-04',
          solarSystemId: 1,
          assignment: { ...existing, groupId: 'existing-group' },
        },
        {
          characterId: CHAR_A,
          date: '2026-09-05',
          solarSystemId: 1,
          assignment: null,
          oreLines: [{ typeId: TYPE_B, quantity: 50 }],
        },
      ],
      'payee-1',
      10,
      () => prices
    );

    expect(created.groupId).toBe('existing-group');
  });

  it('merges two already-assigned members onto one shared groupId without recomputing their values', async () => {
    const first = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      markPaid: false,
    });
    const second = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-05',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_B, quantity: 50 }],
      taxPct: 10,
      estimatedValue: 200,
      taxOwed: 20,
      markPaid: false,
    });

    const [a, b] = await joinAssignments(
      [
        { characterId: CHAR_A, date: first.date, solarSystemId: 1, assignment: first },
        { characterId: CHAR_A, date: second.date, solarSystemId: 1, assignment: second },
      ],
      'payee-1',
      10,
      () => prices
    );

    expect(a.groupId).toBe(b.groupId);
    expect(a.estimatedValue).toBe(1000);
    expect(b.estimatedValue).toBe(200);
    expect(a.status).toBe('outstanding');
    expect(b.status).toBe('outstanding');
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

    await resolveNeedsReview(assignment, freshEntry, [assignment]);

    const updated = await db.miningTaxAssignments.get('a1');
    expect(updated?.oreLines).toEqual([
      { typeId: TYPE_A, quantity: 150 },
      { typeId: TYPE_B, quantity: 999 },
    ]);
    expect(updated?.estimatedValue).toBe(1500 + 999 * 4); // 150*10 + 999*4
    expect(updated?.status).toBe('outstanding');
    expect(updated?.reviewDiff).toBeUndefined();
  });

  it('drops a stale per-ore-type override — it named typeIds against the pre-review line set', async () => {
    const assignment: MiningTaxAssignmentRecord = {
      id: 'a1',
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 900,
      taxOwed: 90,
      status: 'needs-review',
      reviewDiff: [{ typeId: TYPE_A, before: 100, after: 150 }],
      oreLineValues: { [TYPE_A]: 900 },
      updatedAt: 1,
    };
    await db.miningTaxAssignments.put(assignment);

    await resolveNeedsReview(assignment, freshEntry, [assignment]);

    const updated = await db.miningTaxAssignments.get('a1');
    expect(updated?.oreLineValues).toBeUndefined();
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

    const sibling: MiningTaxAssignmentRecord = {
      ...assignment,
      id: 'a-sibling',
      oreLines: [{ typeId: TYPE_B, quantity: 999 }],
      status: 'outstanding',
    };
    await resolveNeedsReview(assignment, freshEntry, [assignment, sibling]);

    const updated = await db.miningTaxAssignments.get('a1');
    expect(updated?.oreLines).toEqual([{ typeId: TYPE_A, quantity: 150 }]);
    expect(updated?.estimatedValue).toBe(1500); // 150 * 10
    expect(updated?.taxOwed).toBe(150);
  });

  it('re-prices at the Payee’s own trade hub, not always at Jita', async () => {
    await db.payees.put({
      id: 'p-hek',
      characterId: CHAR_A,
      name: 'Hek landlord',
      defaultTaxPct: 10,
      hubId: 'hek',
      updatedAt: 1,
    });
    const assignment: MiningTaxAssignmentRecord = {
      id: 'a3',
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p-hek',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      status: 'needs-review',
      reviewDiff: [{ typeId: TYPE_A, before: 100, after: 150 }],
      updatedAt: 1,
    };
    await db.miningTaxAssignments.put(assignment);

    await resolveNeedsReview(assignment, freshEntry, [assignment]);

    // Accepting growth is a fresh invoice moment, and the invoice is still
    // billed at the hub this Payee bills at — re-pricing at Jita would quietly
    // restate the bill at a book the landlord never quoted.
    expect(pricingMock.loadUnitPricesOnDate).toHaveBeenCalledWith(
      CHAR_A,
      expect.anything(),
      expect.objectContaining({ id: 'hek' }),
      assignment.date
    );
  });

  it('re-prices at Jita for a payee-less (dismissed) entry, and for a Payee that has been deleted', async () => {
    const dismissed: MiningTaxAssignmentRecord = {
      id: 'a4',
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 0,
      estimatedValue: 1000,
      taxOwed: 0,
      status: 'needs-review',
      updatedAt: 1,
    };
    await db.miningTaxAssignments.put(dismissed);

    await resolveNeedsReview(dismissed, freshEntry, [dismissed]);
    expect(pricingMock.loadUnitPricesOnDate).toHaveBeenCalledWith(
      CHAR_A,
      expect.anything(),
      expect.objectContaining({ id: 'jita' }),
      dismissed.date
    );

    // A dangling payeeId (the Payee was deleted after the Assignment) resolves
    // the same way rather than throwing partway through a re-snapshot.
    pricingMock.loadUnitPricesOnDate.mockClear();
    await resolveNeedsReview({ ...dismissed, payeeId: 'gone' }, freshEntry, [dismissed]);
    expect(pricingMock.loadUnitPricesOnDate).toHaveBeenCalledWith(
      CHAR_A,
      expect.anything(),
      expect.objectContaining({ id: 'jita' }),
      dismissed.date
    );
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

    await resolveNeedsReview(assignment, freshEntry, [assignment]);

    const updated = await db.miningTaxAssignments.get('a2');
    expect(updated?.status).toBe('outstanding');
    expect(updated?.paidAt).toBeUndefined();
  });
});

describe('markAssignmentsPaid with a payment', () => {
  it('stamps one shared paymentId and the lump-sum amount on every assignment', async () => {
    const a = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      markPaid: false,
    });
    const b = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-05',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 50 }],
      taxPct: 10,
      estimatedValue: 500,
      taxOwed: 50,
      markPaid: false,
    });

    await markAssignmentsPaid([a, b], {
      paidOn: '2026-09-06',
      method: 'donation',
      amount: 150,
      journalLinks: [{ refId: 987, source: 'manual' }],
    });

    const [ua, ub] = await Promise.all([
      db.miningTaxAssignments.get(a.id),
      db.miningTaxAssignments.get(b.id),
    ]);
    expect(ua?.status).toBe('paid');
    expect(ua?.payment?.amount).toBe(150);
    expect(ua?.payment?.method).toBe('donation');
    expect(ua?.payment?.paidOn).toBe('2026-09-06');
    expect(ua?.payment?.journalLinks).toEqual([{ refId: 987, source: 'manual' }]);
    expect(ua?.payment?.contractLinks).toBeUndefined();
    expect(ub?.payment?.paymentId).toBe(ua?.payment?.paymentId);
  });

  it('records nothing about a payment when none is given', async () => {
    const a = await createAssignment({
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      markPaid: false,
    });
    await markAssignmentsPaid([a]);
    const updated = await db.miningTaxAssignments.get(a.id);
    expect(updated?.status).toBe('paid');
    expect(updated?.payment).toBeUndefined();
  });
});

describe('splitAssignment', () => {
  const prices = new Map([
    [TYPE_A, 10],
    [TYPE_B, 4],
  ]);
  /** Both Payees billing at the same hub — the ordinary case. The two-hub case has its own test below. */
  const atOneHub = { kept: prices, moved: prices };

  async function seedOriginal(
    overrides: Partial<MiningTaxAssignmentRecord> = {}
  ): Promise<MiningTaxAssignmentRecord> {
    const record: MiningTaxAssignmentRecord = {
      id: 'orig',
      characterId: CHAR_A,
      date: '2026-09-05',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [
        { typeId: TYPE_A, quantity: 100 },
        { typeId: TYPE_B, quantity: 50 },
      ],
      taxPct: 10,
      estimatedValue: 9999, // a hand-edited figure, deliberately not the Jita value
      taxOwed: 999.9,
      status: 'outstanding',
      updatedAt: 1,
      ...overrides,
    };
    await db.miningTaxAssignments.put(record);
    return record;
  }

  it('moves part of one type to a new outstanding assignment and re-prices both sides', async () => {
    const original = await seedOriginal();

    const { kept, created } = await splitAssignment(
      original,
      {
        moves: [{ typeId: TYPE_A, quantity: 40 }],
        payeeId: 'payee-2',
        taxPct: 8,
        collector: 'original',
      },
      atOneHub
    );

    expect(kept.oreLines).toEqual([
      { typeId: TYPE_A, quantity: 60 },
      { typeId: TYPE_B, quantity: 50 },
    ]);
    expect(kept.estimatedValue).toBe(60 * 10 + 50 * 4);
    expect(kept.taxOwed).toBeCloseTo((60 * 10 + 50 * 4) * 0.1);
    expect(kept.collectsGrowth).toBe(true);
    expect(kept.payeeId).toBe('payee-1');

    expect(created.oreLines).toEqual([{ typeId: TYPE_A, quantity: 40 }]);
    expect(created.payeeId).toBe('payee-2');
    expect(created.taxPct).toBe(8);
    expect(created.estimatedValue).toBe(400);
    expect(created.taxOwed).toBeCloseTo(32);
    expect(created.status).toBe('outstanding');
    expect(created.collectsGrowth).toBeUndefined();
    expect(created.date).toBe(original.date);
    expect(created.solarSystemId).toBe(original.solarSystemId);

    expect(await db.miningTaxAssignments.get('orig')).toEqual(kept);
    expect(await db.miningTaxAssignments.get(created.id)).toEqual(created);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });

  it('drops a stale per-ore-type override on the kept side — it named typeIds against the pre-split line set', async () => {
    const original = await seedOriginal({ oreLineValues: { [TYPE_A]: 900 } });

    const { kept } = await splitAssignment(
      original,
      { moves: [{ typeId: TYPE_B, quantity: 50 }], payeeId: 'payee-2', taxPct: 8 },
      atOneHub
    );

    expect(kept.oreLineValues).toBeUndefined();
  });

  it('flags the new side as the collector when asked, and clears the flag on the original', async () => {
    const original = await seedOriginal({ collectsGrowth: true });

    const { kept, created } = await splitAssignment(
      original,
      {
        moves: [{ typeId: TYPE_B, quantity: 50 }],
        payeeId: 'payee-2',
        taxPct: 8,
        collector: 'new',
      },
      atOneHub
    );

    expect(kept.collectsGrowth).toBeUndefined();
    expect(created.collectsGrowth).toBe(true);
    // Moving a whole line drops it from the kept side entirely.
    expect(kept.oreLines).toEqual([{ typeId: TYPE_A, quantity: 100 }]);
  });

  it('keeps a paid original paid — the paid figure stays with the kept side', async () => {
    const original = await seedOriginal({ status: 'paid', paidAt: 5 });
    const { kept, created } = await splitAssignment(
      original,
      { moves: [{ typeId: TYPE_A, quantity: 10 }], payeeId: 'payee-2', taxPct: 8 },
      atOneHub
    );
    expect(kept.status).toBe('paid');
    expect(kept.paidAt).toBe(5);
    expect(created.status).toBe('outstanding');
  });

  it('splits a needs-review original: the kept side re-opens as outstanding, diff cleared', async () => {
    const original = await seedOriginal({
      status: 'needs-review',
      paidAt: 5,
      reviewDiff: [{ typeId: TYPE_A, before: 0, after: 100 }],
    });
    const { kept, created } = await splitAssignment(
      original,
      { moves: [{ typeId: TYPE_A, quantity: 100 }], payeeId: 'payee-2', taxPct: 8 },
      atOneHub
    );
    expect(kept.status).toBe('outstanding');
    expect(kept.reviewDiff).toBeUndefined();
    expect(kept.paidAt).toBeUndefined();
    expect(created.status).toBe('outstanding');
    expect((await db.miningTaxAssignments.get('orig'))?.reviewDiff).toBeUndefined();
  });

  it('refuses to move more than the original holds, or everything', async () => {
    const original = await seedOriginal();
    await expect(
      splitAssignment(
        original,
        { moves: [{ typeId: TYPE_A, quantity: 101 }], payeeId: 'payee-2', taxPct: 8 },
        atOneHub
      )
    ).rejects.toThrow();
    await expect(
      splitAssignment(
        original,
        {
          moves: [
            { typeId: TYPE_A, quantity: 100 },
            { typeId: TYPE_B, quantity: 50 },
          ],
          payeeId: 'payee-2',
          taxPct: 8,
        },
        atOneHub
      )
    ).rejects.toThrow();
    await expect(
      splitAssignment(original, { moves: [], payeeId: 'payee-2', taxPct: 8 }, atOneHub)
    ).rejects.toThrow();
  });

  it('values each side at its own Payee’s hub when the two bill at different ones', async () => {
    const original = await seedOriginal();

    const { kept, created } = await splitAssignment(
      original,
      { moves: [{ typeId: TYPE_A, quantity: 40 }], payeeId: 'payee-2', taxPct: 8 },
      {
        kept: prices,
        // The second Payee bills at a thinner hub where this ore is worth half.
        moved: new Map([
          [TYPE_A, 5],
          [TYPE_B, 2],
        ]),
      }
    );

    // A split hands ore to a *different* Payee by construction, so the two
    // sides can sit at two different hubs — one blended price would misstate
    // whichever bill it did not come from.
    expect(kept.estimatedValue).toBe(60 * 10 + 50 * 4);
    expect(created.estimatedValue).toBe(40 * 5);
    expect(created.taxOwed).toBeCloseTo(40 * 5 * 0.08);
  });
});

describe('double-assignment guard', () => {
  const base = {
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'payee-1',
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
    taxPct: 5,
    estimatedValue: 1000,
    taxOwed: 50,
    markPaid: false,
  };

  it('createAssignment refuses ore an existing Assignment on the entry already claims', async () => {
    await createAssignment(base);

    await expect(createAssignment({ ...base, markPaid: true })).rejects.toBeInstanceOf(
      AlreadyAssignedError
    );
    expect(await db.miningTaxAssignments.count()).toBe(1);
  });

  it('createAssignment still allows a different ore type on the same entry', async () => {
    await createAssignment(base);
    await createAssignment({ ...base, oreLines: [{ typeId: TYPE_B, quantity: 5 }] });
    expect(await db.miningTaxAssignments.count()).toBe(2);
  });

  it('createAssignment counts a dismissal as a claim', async () => {
    await dismissEntry({
      characterId: CHAR_A,
      date: base.date,
      solarSystemId: 1,
      oreLines: base.oreLines,
      estimatedValue: 1000,
    });
    await expect(createAssignment(base)).rejects.toBeInstanceOf(AlreadyAssignedError);
  });

  it('joinAssignments refuses to create a member whose ore is already claimed', async () => {
    await createAssignment(base);

    await expect(
      joinAssignments(
        [
          {
            characterId: CHAR_A,
            date: base.date,
            solarSystemId: 1,
            assignment: null,
            oreLines: base.oreLines,
          },
        ],
        'payee-1',
        5,
        () => new Map([[TYPE_A, 10]])
      )
    ).rejects.toBeInstanceOf(AlreadyAssignedError);
    expect(await db.miningTaxAssignments.count()).toBe(1);
  });

  it('refuses a twin when the entry holds no more than the first claim, even across a stale view', async () => {
    const withEntry = { ...base, entryOreLines: [{ typeId: TYPE_A, quantity: 100 }] };
    await createAssignment(withEntry);
    await expect(createAssignment(withEntry)).rejects.toBeInstanceOf(AlreadyAssignedError);
  });

  it('still allows a claim on growth another Assignment on that type has not covered', async () => {
    await createAssignment({
      ...base,
      oreLines: [{ typeId: TYPE_A, quantity: 60 }],
      entryOreLines: [{ typeId: TYPE_A, quantity: 130 }],
    });
    await createAssignment({
      ...base,
      payeeId: 'payee-2',
      oreLines: [{ typeId: TYPE_A, quantity: 40 }],
      entryOreLines: [{ typeId: TYPE_A, quantity: 130 }],
    });
    // 60 + 40 claimed of 130: the 30 residual is still assignable.
    await createAssignment({
      ...base,
      payeeId: 'payee-3',
      oreLines: [{ typeId: TYPE_A, quantity: 30 }],
      entryOreLines: [{ typeId: TYPE_A, quantity: 130 }],
    });
    expect(await db.miningTaxAssignments.count()).toBe(3);
  });
});

function member(
  id: string,
  date: string,
  overrides: Partial<MiningTaxAssignmentRecord> = {}
): MiningTaxAssignmentRecord {
  return {
    id,
    characterId: CHAR_A,
    date,
    solarSystemId: 30001,
    payeeId: 'star-tail',
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
    taxPct: 5,
    estimatedValue: 1000,
    taxOwed: 50,
    status: 'outstanding',
    groupId: 'g1',
    updatedAt: 1,
    ...overrides,
  };
}

describe('updateCombinedAssignments', () => {
  it('moves every member onto one Payee and rate and keeps them combined', async () => {
    const d3 = member('d3', '2026-10-03');
    const d4 = member('d4', '2026-10-04');
    await db.miningTaxAssignments.bulkPut([d3, d4]);

    await updateCombinedAssignments([d3, d4], {
      payeeId: 'bureau',
      taxPct: 6,
      members: {
        d3: { estimatedValue: 2000, taxOwed: 120, oreLineValues: { [TYPE_A]: 2000 } },
        d4: { estimatedValue: 3000, taxOwed: 180 },
      },
    });

    const [s3, s4] = await Promise.all([
      db.miningTaxAssignments.get('d3'),
      db.miningTaxAssignments.get('d4'),
    ]);
    expect(s3).toMatchObject({ payeeId: 'bureau', taxPct: 6, taxOwed: 120, groupId: 'g1' });
    expect(s3?.oreLineValues).toEqual({ [TYPE_A]: 2000 });
    expect(s4).toMatchObject({ payeeId: 'bureau', taxPct: 6, estimatedValue: 3000, groupId: 'g1' });
    expect(s4?.oreLineValues).toBeUndefined();
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });

  it('leaves status and payment alone', async () => {
    const paid = member('d3', '2026-10-03', {
      status: 'paid',
      paidAt: 5,
      payment: { paymentId: 'p1', paidOn: '2026-10-04', method: 'donation', amount: 50 },
    });
    await db.miningTaxAssignments.put(paid);

    await updateCombinedAssignments([paid], {
      payeeId: 'star-tail',
      taxPct: 5,
      members: { d3: { estimatedValue: 1100, taxOwed: 55 } },
    });

    const stored = await db.miningTaxAssignments.get('d3');
    expect(stored?.status).toBe('paid');
    expect(stored?.payment?.paymentId).toBe('p1');
  });
});

describe('uncombineAssignments', () => {
  it('takes members out of their combined entry without unassigning them', async () => {
    const d3 = member('d3', '2026-10-03');
    await db.miningTaxAssignments.put(d3);

    await uncombineAssignments([d3]);

    const stored = await db.miningTaxAssignments.get('d3');
    expect(stored?.groupId).toBeUndefined();
    expect(stored).toMatchObject({ payeeId: 'star-tail', status: 'outstanding', taxOwed: 50 });
  });
});

describe('moveAssignmentsToPayee', () => {
  it('re-points Assignments at another Payee and keeps every figure and combination', async () => {
    const d3 = member('d3', '2026-10-03');
    await db.miningTaxAssignments.put(d3);

    await moveAssignmentsToPayee([d3], 'bureau');

    const stored = await db.miningTaxAssignments.get('d3');
    expect(stored).toMatchObject({ payeeId: 'bureau', taxPct: 5, taxOwed: 50, groupId: 'g1' });
  });
});
