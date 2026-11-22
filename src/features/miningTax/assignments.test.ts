import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import {
  AlreadyAssignedError,
  createAssignment,
  deleteAssignments,
  dismissEntries,
  joinAssignments,
  moveAssignmentsToPayee,
  planNeedsReviewResolution,
  loadReleasePrices,
  releaseOreFromAssignment,
  splitAssignment,
  uncombineAssignments,
  updateCombinedAssignments,
} from './assignments';
import { useMiningTaxCompressedOre } from './oreForm';
import { readLegacyPaidMarks } from './paymentLinkStore';
import { putAssignments } from './storedAssignments';
import { readTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_ASSIGNMENTS } from '@/sync/syncedCollections';

// Only `loadUnitPricesOnDate` is stubbed: `hubForPayee` is pure hub lookup,
// and the point of these tests is *which* hub/date the real resolver hands
// the fetch.
const pricingMock = vi.hoisted(() => ({ loadUnitPricesOnDate: vi.fn() }));
vi.mock('./pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pricing')>()),
  loadUnitPricesOnDate: pricingMock.loadUnitPricesOnDate,
}));

const CHAR_A = 1;
/** Paid as the test's stored record says: the account's reading, stood in for. */
const byStatus = (a: MiningTaxAssignmentRecord) => a.status === 'paid';
const TYPE_A = 45490;
const TYPE_B = 45491;

beforeEach(async () => {
  useMiningTaxCompressedOre.setState({ value: true, hydrated: true });
  vi.clearAllMocks();
  await db.miningTaxAssignments.clear();
  await db.miningTaxPaymentLinks.clear();
  await db.payees.clear();
  await db.settings.clear();
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
      isPaid: byStatus,
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
    });

    expect(assignment.estimatedValue).toBe(1000);
    expect(assignment.taxOwed).toBe(100);
    expect(assignment.status).toBe('outstanding');
    expect(assignment.paidAt).toBeUndefined();
    expect(await db.miningTaxAssignments.get(assignment.id)).toEqual(assignment);
    // No internal price lookup — the Assign dialog already resolved (and
    // possibly corrected) the value before calling this.
    expect(pricingMock.loadUnitPricesOnDate).not.toHaveBeenCalled();
  });

  it('marks the record raw-priced when the Ore Form setting is off, so a later flip can re-price it', async () => {
    useMiningTaxCompressedOre.setState({ value: false, hydrated: true });

    const assignment = await createAssignment({
      isPaid: byStatus,
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
    });

    expect(assignment.rawOrePriced).toBe(true);
  });

  it('stores a pilot-corrected value verbatim, even when it disagrees with the Jita price', async () => {
    const assignment = await createAssignment({
      isPaid: byStatus,
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 4200, // not what TYPE_A's price would compute to
      taxOwed: 420,
    });

    expect(assignment.estimatedValue).toBe(4200);
    expect(assignment.taxOwed).toBe(420);
  });
});

describe("assigning a paid day's late ore (paid stays paid, ADR 0024)", () => {
  const paidDay = (
    overrides: Partial<MiningTaxAssignmentRecord> = {}
  ): MiningTaxAssignmentRecord => ({
    id: 'paid',
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'payee-1',
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'paid',
    paidAt: 5,
    updatedAt: 1,
    ...overrides,
  });
  const lateOre = {
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'payee-1',
    oreLines: [{ typeId: TYPE_A, quantity: 50 }],
    entryOreLines: [{ typeId: TYPE_A, quantity: 150 }],
    taxPct: 10,
    estimatedValue: 500,
    taxOwed: 50,
  };

  it("makes the new entry the collector, so the day's later ore folds into it rather than the paid one", async () => {
    const paid = paidDay();
    await db.miningTaxAssignments.put(paid);

    const created = await createAssignment({ ...lateOre, isPaid: byStatus });

    expect(created.collectsGrowth).toBe(true);
    expect(await db.miningTaxAssignments.get('paid')).toEqual(paid);
  });

  it('takes the flag over from a paid flagged collector of a split, leaving one collector', async () => {
    const paid = paidDay({ collectsGrowth: true, oreLines: [{ typeId: TYPE_A, quantity: 60 }] });
    await db.miningTaxAssignments.bulkPut([
      paid,
      paidDay({
        id: 'other',
        payeeId: 'payee-2',
        status: 'outstanding',
        paidAt: undefined,
        oreLines: [{ typeId: TYPE_A, quantity: 40 }],
      }),
    ]);

    const created = await createAssignment({ ...lateOre, isPaid: byStatus });

    expect(created.collectsGrowth).toBe(true);
    // Only the flag moves; the paid record's ore and tax stay as they were (an old mark goes).
    const stored = await db.miningTaxAssignments.get('paid');
    expect(stored?.collectsGrowth).toBeUndefined();
    expect(stored).toMatchObject({
      oreLines: paid.oreLines,
      estimatedValue: paid.estimatedValue,
      taxOwed: paid.taxOwed,
    });
  });

  it("leaves the flag off when the day's collector is not paid", async () => {
    await db.miningTaxAssignments.put(
      paidDay({ status: 'outstanding', paidAt: undefined, collectsGrowth: true })
    );
    await db.miningTaxAssignments.put(
      paidDay({
        id: 'other',
        status: 'outstanding',
        paidAt: undefined,
        oreLines: [{ typeId: TYPE_B, quantity: 10 }],
      })
    );

    const created = await createAssignment({
      isPaid: byStatus,
      ...lateOre,
      entryOreLines: [
        { typeId: TYPE_A, quantity: 150 },
        { typeId: TYPE_B, quantity: 10 },
      ],
    });

    expect(created.collectsGrowth).toBeUndefined();
  });

  it('leaves the flag off on an entry nobody has assigned yet', async () => {
    const created = await createAssignment({ ...lateOre, isPaid: byStatus });
    expect(created.collectsGrowth).toBeUndefined();
  });

  it('takesGrowth makes the new entry the collector over an unpaid one, moving the flag', async () => {
    await db.miningTaxAssignments.put(
      paidDay({ status: 'outstanding', paidAt: undefined, collectsGrowth: true })
    );

    const created = await createAssignment({
      isPaid: byStatus,
      ...lateOre,
      payeeId: 'payee-2',
      takesGrowth: true,
    });

    expect(created.collectsGrowth).toBe(true);
    expect((await db.miningTaxAssignments.get('paid'))?.collectsGrowth).toBeUndefined();
  });

  it('takesGrowth leaves the flag off on an entry nobody has assigned yet', async () => {
    const created = await createAssignment({
      isPaid: byStatus,
      ...lateOre,
      takesGrowth: true,
    });
    expect(created.collectsGrowth).toBeUndefined();
  });

  it("makes a member a combine creates from a paid day's late ore the collector too", async () => {
    await db.miningTaxAssignments.put(paidDay());

    const [late, nextDay] = await joinAssignments(
      [
        { ...lateOre, assignment: null },
        {
          characterId: CHAR_A,
          date: '2026-09-05',
          solarSystemId: 1,
          assignment: null,
          oreLines: [{ typeId: TYPE_B, quantity: 10 }],
        },
      ],
      'payee-1',
      10,
      () =>
        new Map([
          [TYPE_A, 10],
          [TYPE_B, 4],
        ]),
      byStatus
    );

    expect(late.collectsGrowth).toBe(true);
    expect(nextDay.collectsGrowth).toBeUndefined();
  });
});

describe('Moon / structure label', () => {
  it('createAssignment stores a trimmed label and omits a blank one', async () => {
    const base = {
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 30000142,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
    };
    const labelled = await createAssignment({
      isPaid: byStatus,
      ...base,
      label: '  Athanor  ',
    });
    expect(labelled.label).toBe('Athanor');
    await db.miningTaxAssignments.clear();
    const blank = await createAssignment({
      isPaid: byStatus,
      ...base,
      label: '   ',
    });
    expect('label' in blank).toBe(false);
  });

  it('splitAssignment labels the new slice and leaves the kept slice its own label', async () => {
    const original: MiningTaxAssignmentRecord = {
      id: 'orig',
      characterId: CHAR_A,
      date: '2026-09-05',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 5,
      estimatedValue: 1000,
      taxOwed: 50,
      status: 'outstanding',
      label: 'Moon 1',
      updatedAt: 1,
    };
    await db.miningTaxAssignments.put(original);
    const prices = new Map([[TYPE_A, 10]]);

    const { kept, created } = await splitAssignment(
      original,
      { moves: [{ typeId: TYPE_A, quantity: 40 }], payeeId: 'payee-1', taxPct: 8, label: 'Moon 2' },
      { kept: prices, moved: prices }
    );

    expect(kept.label).toBe('Moon 1');
    expect(created.label).toBe('Moon 2');
  });
});

describe('dismissEntries for one entry', () => {
  it('creates a payee-less, zero-tax Assignment with status dismissed', async () => {
    const [dismissed] = await dismissEntries([
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 100 }],
        estimatedValue: 1000,
      },
    ]);

    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.payeeId).toBeUndefined();
    expect(dismissed.taxPct).toBe(0);
    expect(dismissed.taxOwed).toBe(0);
    expect(dismissed.estimatedValue).toBe(1000);
    expect(await db.miningTaxAssignments.get(dismissed.id)).toEqual(dismissed);
  });
});

describe('dismissEntries', () => {
  it('dismisses every entry at once', async () => {
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
  });

  it('writes nothing for an empty list', async () => {
    expect(await dismissEntries([])).toEqual([]);
    expect(await db.miningTaxAssignments.count()).toBe(0);
  });
});

describe('deleteAssignments', () => {
  it('deletes the row and tombstones it so the deletion syncs', async () => {
    const assignment = await createAssignment({
      isPaid: byStatus,
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: TYPE_A, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 100,
      taxOwed: 10,
    });
    await deleteAssignments([assignment]);
    expect(await db.miningTaxAssignments.get(assignment.id)).toBeUndefined();
    const tombstones = await readTombstones(tombstoneKey(MINING_TAX_ASSIGNMENTS, CHAR_A));
    expect(tombstones.map((t) => t.id)).toEqual([assignment.id]);
  });

  it('tombstones each Assignment under its own character', async () => {
    const [mine, theirs] = await dismissEntries([
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 10 }],
        estimatedValue: 100,
      },
      {
        characterId: 2,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: TYPE_A, quantity: 10 }],
        estimatedValue: 100,
      },
    ]);
    await deleteAssignments([mine, theirs]);
    expect(await db.miningTaxAssignments.count()).toBe(0);
    const a = await readTombstones(tombstoneKey(MINING_TAX_ASSIGNMENTS, CHAR_A));
    const b = await readTombstones(tombstoneKey(MINING_TAX_ASSIGNMENTS, 2));
    expect(a.map((t) => t.id)).toEqual([mine.id]);
    expect(b.map((t) => t.id)).toEqual([theirs.id]);
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
      () => prices,
      byStatus
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
      pricesOn,
      byStatus
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
      isPaid: byStatus,
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
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
      () => prices,
      byStatus
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
      isPaid: byStatus,
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
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
      () => prices,
      byStatus
    );

    expect(created.groupId).toBe('existing-group');
  });

  it('merges two already-assigned members onto one shared groupId without recomputing their values', async () => {
    const first = await createAssignment({
      isPaid: byStatus,
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
    });
    const second = await createAssignment({
      isPaid: byStatus,
      characterId: CHAR_A,
      date: '2026-09-05',
      solarSystemId: 1,
      payeeId: 'payee-1',
      oreLines: [{ typeId: TYPE_B, quantity: 50 }],
      taxPct: 10,
      estimatedValue: 200,
      taxOwed: 20,
    });

    const [a, b] = await joinAssignments(
      [
        { characterId: CHAR_A, date: first.date, solarSystemId: 1, assignment: first },
        { characterId: CHAR_A, date: second.date, solarSystemId: 1, assignment: second },
      ],
      'payee-1',
      10,
      () => prices,
      byStatus
    );

    expect(a.groupId).toBe(b.groupId);
    expect(a.estimatedValue).toBe(1000);
    expect(b.estimatedValue).toBe(200);
    expect(a.status).toBe('outstanding');
    expect(b.status).toBe('outstanding');
  });
});

describe('planNeedsReviewResolution', () => {
  /** Plans and writes, the way an action does — these tests read the stored result. */
  async function planAndWrite(
    ...args: Parameters<typeof planNeedsReviewResolution>
  ): Promise<void> {
    await putAssignments([await planNeedsReviewResolution(...args)]);
  }

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

    await planAndWrite(assignment, freshEntry, [assignment]);

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

    await planAndWrite(assignment, freshEntry, [assignment]);

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
    await planAndWrite(assignment, freshEntry, [assignment, sibling]);

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

    await planAndWrite(assignment, freshEntry, [assignment]);

    // Accepting growth is a fresh invoice moment, and the invoice is still
    // billed at the hub this Payee bills at — re-pricing at Jita would quietly
    // restate the bill at a book the landlord never quoted.
    expect(pricingMock.loadUnitPricesOnDate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'hek' }),
      assignment.date,
      true
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

    await planAndWrite(dismissed, freshEntry, [dismissed]);
    expect(pricingMock.loadUnitPricesOnDate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'jita' }),
      dismissed.date,
      true
    );

    // A dangling payeeId (the Payee was deleted after the Assignment) resolves
    // the same way rather than throwing partway through a re-snapshot.
    pricingMock.loadUnitPricesOnDate.mockClear();
    await planAndWrite({ ...dismissed, payeeId: 'gone' }, freshEntry, [dismissed]);
    expect(pricingMock.loadUnitPricesOnDate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'jita' }),
      dismissed.date,
      true
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

    await planAndWrite(assignment, freshEntry, [assignment]);

    const updated = await db.miningTaxAssignments.get('a2');
    expect(updated?.status).toBe('outstanding');
    expect(updated?.paidAt).toBeUndefined();
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

  it('hands the Growth Collector flag over from a third Assignment on the entry, leaving one collector', async () => {
    const third: MiningTaxAssignmentRecord = {
      id: 'third',
      characterId: CHAR_A,
      date: '2026-09-05',
      solarSystemId: 1,
      payeeId: 'payee-3',
      oreLines: [{ typeId: TYPE_B, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 40,
      taxOwed: 4,
      status: 'outstanding',
      collectsGrowth: true,
      updatedAt: 1,
    };
    await db.miningTaxAssignments.put(third);
    const original = await seedOriginal();

    const { created } = await splitAssignment(
      original,
      {
        moves: [{ typeId: TYPE_A, quantity: 40 }],
        payeeId: 'payee-2',
        taxPct: 8,
        collector: 'new',
      },
      atOneHub
    );

    expect(created.collectsGrowth).toBe(true);
    const handedOver = await db.miningTaxAssignments.get('third');
    expect(handedOver?.collectsGrowth).toBeUndefined();
    expect(handedOver?.oreLines).toEqual(third.oreLines);
  });

  it('leaves a third Assignment collecting when no Growth Collector is chosen', async () => {
    const third: MiningTaxAssignmentRecord = {
      id: 'third',
      characterId: CHAR_A,
      date: '2026-09-05',
      solarSystemId: 1,
      payeeId: 'payee-3',
      oreLines: [{ typeId: TYPE_B, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 40,
      taxOwed: 4,
      status: 'paid',
      paidAt: 3,
      collectsGrowth: true,
      updatedAt: 1,
    };
    await db.miningTaxAssignments.put(third);
    const original = await seedOriginal();

    await splitAssignment(
      original,
      { moves: [{ typeId: TYPE_A, quantity: 40 }], payeeId: 'payee-2', taxPct: 8 },
      atOneHub
    );

    expect(await db.miningTaxAssignments.get('third')).toEqual(third);
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

  it('lets the kept side claim ore ESI has not reported yet, the new side collecting what comes after', async () => {
    const original = await seedOriginal();

    const { kept, created } = await splitAssignment(
      original,
      {
        moves: [],
        unreported: [{ typeId: TYPE_A, quantity: 30 }],
        payeeId: 'payee-2',
        taxPct: 8,
        collector: 'new',
      },
      atOneHub
    );

    expect(kept.oreLines).toEqual([
      { typeId: TYPE_A, quantity: 130 },
      { typeId: TYPE_B, quantity: 50 },
    ]);
    expect(kept.estimatedValue).toBe(130 * 10 + 50 * 4);
    expect(created.oreLines).toEqual([]);
    expect(created.estimatedValue).toBe(0);
    expect(created.collectsGrowth).toBe(true);
  });

  it('refuses an unreported claim the new side does not collect after, or on a paid original', async () => {
    const original = await seedOriginal();
    const claim = {
      moves: [],
      unreported: [{ typeId: TYPE_A, quantity: 30 }],
      payeeId: 'payee-2',
      taxPct: 8,
    };
    await expect(
      splitAssignment(original, { ...claim, collector: 'original' }, atOneHub)
    ).rejects.toThrow();
    await expect(splitAssignment(original, claim, atOneHub)).rejects.toThrow();
    const paid = await seedOriginal({ status: 'paid', paidAt: 5 });
    await expect(splitAssignment(paid, { ...claim, collector: 'new' }, atOneHub)).rejects.toThrow();
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
  };

  it('createAssignment refuses ore an existing Assignment on the entry already claims', async () => {
    await createAssignment({ ...base, isPaid: byStatus });

    await expect(
      createAssignment({
        isPaid: byStatus,
        ...base,
      })
    ).rejects.toBeInstanceOf(AlreadyAssignedError);
    expect(await db.miningTaxAssignments.count()).toBe(1);
  });

  it('createAssignment still allows a different ore type on the same entry', async () => {
    await createAssignment({ ...base, isPaid: byStatus });
    await createAssignment({
      isPaid: byStatus,
      ...base,
      oreLines: [{ typeId: TYPE_B, quantity: 5 }],
    });
    expect(await db.miningTaxAssignments.count()).toBe(2);
  });

  it('createAssignment counts a dismissal as a claim', async () => {
    await dismissEntries([
      {
        characterId: CHAR_A,
        date: base.date,
        solarSystemId: 1,
        oreLines: base.oreLines,
        estimatedValue: 1000,
      },
    ]);
    await expect(createAssignment({ ...base, isPaid: byStatus })).rejects.toBeInstanceOf(
      AlreadyAssignedError
    );
  });

  it('joinAssignments refuses to create a member whose ore is already claimed', async () => {
    await createAssignment({ ...base, isPaid: byStatus });

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
        () => new Map([[TYPE_A, 10]]),
        byStatus
      )
    ).rejects.toBeInstanceOf(AlreadyAssignedError);
    expect(await db.miningTaxAssignments.count()).toBe(1);
  });

  it('refuses a twin when the entry holds no more than the first claim, even across a stale view', async () => {
    const withEntry = { ...base, entryOreLines: [{ typeId: TYPE_A, quantity: 100 }] };
    await createAssignment({ ...withEntry, isPaid: byStatus });
    await expect(createAssignment({ ...withEntry, isPaid: byStatus })).rejects.toBeInstanceOf(
      AlreadyAssignedError
    );
  });

  it('still allows a claim on growth another Assignment on that type has not covered', async () => {
    await createAssignment({
      isPaid: byStatus,
      ...base,
      oreLines: [{ typeId: TYPE_A, quantity: 60 }],
      entryOreLines: [{ typeId: TYPE_A, quantity: 130 }],
    });
    await createAssignment({
      isPaid: byStatus,
      ...base,
      payeeId: 'payee-2',
      oreLines: [{ typeId: TYPE_A, quantity: 40 }],
      entryOreLines: [{ typeId: TYPE_A, quantity: 130 }],
    });
    // 60 + 40 claimed of 130: the 30 residual is still assignable.
    await createAssignment({
      isPaid: byStatus,
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
  });

  it('keeps no old paid mark: Paid is read off the account', async () => {
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
    expect(stored?.status).toBe('outstanding');
    expect(stored?.payment).toBeUndefined();
  });
});

describe('updateCombinedAssignments label', () => {
  const same = { estimatedValue: 100, taxOwed: 5 };

  it('sets one label on every member and touches nothing else', async () => {
    const d3 = member('d3', '2026-10-03', { status: 'paid', paidAt: 5 });
    const d4 = member('d4', '2026-10-04');
    await db.miningTaxAssignments.bulkPut([d3, d4]);

    await updateCombinedAssignments([d3, d4], {
      payeeId: 'star-tail',
      taxPct: d3.taxPct,
      label: '  Athanor in Q-S ',
      members: { d3: same, d4: same },
    });

    const [s3, s4] = await Promise.all([
      db.miningTaxAssignments.get('d3'),
      db.miningTaxAssignments.get('d4'),
    ]);
    expect(s3).toMatchObject({ label: 'Athanor in Q-S', groupId: 'g1' });
    expect(s4?.label).toBe('Athanor in Q-S');
  });

  it('removes the label when the new one is blank', async () => {
    const d3 = member('d3', '2026-10-03', { label: 'Old moon' });
    await db.miningTaxAssignments.put(d3);
    await updateCombinedAssignments([d3], {
      payeeId: 'star-tail',
      taxPct: d3.taxPct,
      label: '   ',
      members: { d3: same },
    });
    expect((await db.miningTaxAssignments.get('d3'))?.label).toBeUndefined();
  });

  it('keeps the label when the input leaves it out', async () => {
    const d3 = member('d3', '2026-10-03', { label: 'Old moon' });
    await db.miningTaxAssignments.put(d3);
    await updateCombinedAssignments([d3], {
      payeeId: 'star-tail',
      taxPct: d3.taxPct,
      members: { d3: same },
    });
    expect((await db.miningTaxAssignments.get('d3'))?.label).toBe('Old moon');
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

describe('releaseOreFromAssignment', () => {
  const base: MiningTaxAssignmentRecord = {
    id: 'a1',
    characterId: CHAR_A,
    date: '2026-09-05',
    solarSystemId: 1,
    payeeId: 'payee-1',
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    oreLineValues: { [TYPE_A]: 1000 },
    updatedAt: 1,
  };

  it('re-prices what is left at its Payee hub on the mined day', async () => {
    await db.miningTaxAssignments.put(base);
    const left = [{ typeId: TYPE_A, quantity: 40 }];
    const priced = await loadReleasePrices(base, left);
    // The write runs in the ledger's transaction, as `releaseOre` runs it.
    const out = await db.transaction('rw', db.miningTaxAssignments, db.payees, db.settings, () =>
      releaseOreFromAssignment(base, left, priced)
    );
    // TYPE_A is 10 a unit: 40 × 10, at 10%.
    expect(out).toMatchObject({ estimatedValue: 400, taxOwed: 40 });
    expect(out?.oreLineValues).toBeUndefined();
    expect(pricingMock.loadUnitPricesOnDate).toHaveBeenCalledWith(
      [TYPE_A],
      expect.anything(),
      '2026-09-05',
      true
    );
    expect((await db.miningTaxAssignments.get('a1'))?.oreLines).toEqual([
      { typeId: TYPE_A, quantity: 40 },
    ]);
  });

  it('prices each ore type it keeps at its own price, not the day average', async () => {
    const mixed: MiningTaxAssignmentRecord = {
      ...base,
      oreLines: [
        { typeId: TYPE_A, quantity: 100 },
        { typeId: TYPE_B, quantity: 100 },
      ],
      // A pilot-edited figure: 100 × 10 + 100 × 4 = 1400 at market.
      estimatedValue: 2000,
      taxOwed: 250,
    };
    delete mixed.oreLineValues;
    await db.miningTaxAssignments.put(mixed);
    const left = [{ typeId: TYPE_B, quantity: 100 }];
    const out = await releaseOreFromAssignment(mixed, left, await loadReleasePrices(mixed, left));
    expect(out).toMatchObject({ estimatedValue: 400, taxOwed: 40 });
  });

  it('deletes the Assignment, with a tombstone, when nothing is left', async () => {
    await db.miningTaxAssignments.put(base);
    expect(
      await releaseOreFromAssignment(base, [], { prices: new Map(), compressed: true })
    ).toBeUndefined();
    expect(await db.miningTaxAssignments.get('a1')).toBeUndefined();
    expect(await readTombstones(tombstoneKey(MINING_TAX_ASSIGNMENTS, CHAR_A))).toEqual([
      expect.objectContaining({ id: 'a1' }),
    ]);
  });
});

describe('override (a Default System made it, and nobody has changed it)', () => {
  const made = (id = 'dm', overrides: Partial<MiningTaxAssignmentRecord> = {}) =>
    ({
      id,
      characterId: CHAR_A,
      date: '2026-10-03',
      solarSystemId: 1,
      payeeId: 'landlord',
      oreLines: [
        { typeId: TYPE_A, quantity: 100 },
        { typeId: TYPE_B, quantity: 50 },
      ],
      taxPct: 5,
      estimatedValue: 1000,
      taxOwed: 50,
      status: 'outstanding',
      override: false,
      updatedAt: 1,
      ...overrides,
    }) satisfies MiningTaxAssignmentRecord;

  it('is written as false only when a Default System assigns', async () => {
    const input = {
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'landlord',
      oreLines: [{ typeId: TYPE_A, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
    };
    expect(
      (
        await createAssignment({
          isPaid: byStatus,
          ...input,
          byDefault: true,
        })
      ).override
    ).toBe(false);
    await db.miningTaxAssignments.clear();
    expect('override' in (await createAssignment({ ...input, isPaid: byStatus }))).toBe(false);
  });

  it('is cleared when the pilot edits the entry', async () => {
    const row = made();
    await db.miningTaxAssignments.put(row);
    await updateCombinedAssignments([row], {
      payeeId: 'landlord',
      taxPct: 6,
      members: { dm: { estimatedValue: 1000, taxOwed: 60 } },
    });
    expect('override' in (await db.miningTaxAssignments.get('dm'))!).toBe(false);
  });

  it('is cleared when the pilot changes the Payee', async () => {
    const row = made();
    await db.miningTaxAssignments.put(row);
    await moveAssignmentsToPayee([row], 'bureau');
    expect('override' in (await db.miningTaxAssignments.get('dm'))!).toBe(false);
  });

  it('is cleared on the kept side of a split, and the new side was never a default', async () => {
    const row = made();
    await db.miningTaxAssignments.put(row);
    const prices = new Map([
      [TYPE_A, 10],
      [TYPE_B, 4],
    ]);
    const { kept, created } = await splitAssignment(
      row,
      {
        moves: [{ typeId: TYPE_A, quantity: 40 }],
        payeeId: 'payee-2',
        taxPct: 8,
        collector: 'original',
      },
      { kept: prices, moved: prices }
    );
    expect('override' in kept).toBe(false);
    expect('override' in created).toBe(false);
  });

  it('is cleared when the pilot joins entries', async () => {
    const row = made();
    await db.miningTaxAssignments.put(row);
    const [joined] = await joinAssignments(
      [{ characterId: CHAR_A, date: row.date, solarSystemId: 1, assignment: row }],
      'landlord',
      5,
      () => new Map(),
      byStatus
    );
    expect('override' in joined).toBe(false);
  });

  const priced = { prices: new Map([[TYPE_B, 4]]), compressed: true };

  it('survives a Survey takeover releasing some of its ore: the rest is still the default’s', async () => {
    const row = made();
    await db.miningTaxAssignments.put(row);
    const next = await releaseOreFromAssignment(
      row,
      [{ typeId: TYPE_B, quantity: 50 }],
      priced,
      true
    );
    expect(next?.override).toBe(false);
  });

  it('is cleared when the pilot lets the corporation bill some of the ore', async () => {
    const row = made();
    await db.miningTaxAssignments.put(row);
    const next = await releaseOreFromAssignment(row, [{ typeId: TYPE_B, quantity: 50 }], priced);
    expect(next && 'override' in next).toBe(false);
  });
});

describe('a view never reaches a write (B1)', () => {
  const record = (over: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord => ({
    id: 'a1',
    characterId: 7,
    date: '2026-10-01',
    solarSystemId: 30000142,
    payeeId: 'p1',
    oreLines: [{ typeId: 45490, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1_000_000,
    taxOwed: 100_000,
    status: 'outstanding',
    updatedAt: 0,
    ...over,
  });

  it('editing, uncombining or splitting a day its link paid writes no mark, so no link is read from it', async () => {
    await putAssignments([record({ groupId: 'g' })]);
    // The row on screen: paid by a link, so its view says Paid.
    const view = { ...record({ groupId: 'g' }), status: 'paid' as const };
    await updateCombinedAssignments([view], { payeeId: 'p1', taxPct: 12, members: {} });
    await uncombineAssignments([{ ...view, taxPct: 12 }]);
    const prices = { kept: new Map([[45490, 10_000]]), moved: new Map([[45490, 10_000]]) };
    await splitAssignment(
      { ...view, taxPct: 12 },
      { moves: [{ typeId: 45490, quantity: 40 }], payeeId: 'p2', taxPct: 5 },
      prices
    );
    expect((await db.miningTaxAssignments.toArray()).map((a) => a.status)).toEqual([
      'outstanding',
      'outstanding',
    ]);
    await readLegacyPaidMarks();
    expect(await db.miningTaxPaymentLinks.count()).toBe(0);
  });
});
