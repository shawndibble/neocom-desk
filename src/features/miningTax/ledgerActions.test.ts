import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { readTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_ASSIGNMENTS } from '@/sync/syncedCollections';
import type { GroupMember, DisplayRow } from './groupRows';
import type { SessionContinuation } from './sessionContinuation';
import type { MoonMiningTaxRow } from './snapshot';
import {
  acceptNewTotal,
  assign,
  combine,
  continueSession,
  dismiss,
  settle,
  unassign,
  uncombine,
  undoContinue,
} from './ledgerActions';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const pricingMock = vi.hoisted(() => ({ loadUnitPricesOnDate: vi.fn() }));
vi.mock('./pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pricing')>()),
  loadUnitPricesOnDate: pricingMock.loadUnitPricesOnDate,
}));

const CHAR = 1;
const SYSTEM = 30000142;
const ORE = 45490;
const PRICES = new Map([[ORE, 10]]);

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: CHAR,
    date: '2026-09-04',
    solarSystemId: SYSTEM,
    payeeId: 'p1',
    oreLines: [{ typeId: ORE, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

function entry(date: string, quantity: number): MiningLedgerEntry {
  return {
    characterId: CHAR,
    date,
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ORE, quantity }],
  };
}

function row(e: MiningLedgerEntry, assignments: MiningTaxAssignmentRecord[]): MoonMiningTaxRow {
  return {
    characterId: CHAR,
    characterName: 'Pilot',
    entry: e,
    assignments,
    unassignedOreLines: assignments.length === 0 ? e.oreLines : [],
  };
}

/** Yesterday's owed day, and today's still-unassigned entry continuing it. */
function continuation(previous: MiningTaxAssignmentRecord): SessionContinuation {
  const nextRow = row(entry('2026-09-05', 50), []);
  const next: DisplayRow = {
    key: 'next',
    row: nextRow,
    assignment: null,
    status: 'unassigned',
  };
  return {
    next,
    previousRow: {
      key: 'prev',
      row: row(entry(previous.date, 100), [previous]),
      assignment: previous,
      status: 'outstanding',
    },
    previous,
    payeeId: previous.payeeId!,
  };
}

async function stored(): Promise<MiningTaxAssignmentRecord[]> {
  return db.miningTaxAssignments.toArray();
}

async function tombstonedIds(): Promise<string[]> {
  return (await readTombstones(tombstoneKey(MINING_TAX_ASSIGNMENTS, CHAR))).map((t) => t.id);
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  await db.miningTaxAssignments.clear();
  await db.payees.clear();
  await db.settings.clear();
  pricingMock.loadUnitPricesOnDate.mockResolvedValue({
    prices: PRICES,
    unpriced: new Set<number>(),
  });
});

describe('continueSession', () => {
  it('combines the next day into the previous one on its Payee and rate, then syncs once', async () => {
    const previous = assignment();
    await db.miningTaxAssignments.put(previous);

    const result = await continueSession(continuation(previous), () => PRICES);

    expect(result.ok).toBe(true);
    const records = await stored();
    expect(records).toHaveLength(2);
    const created = records.find((r) => r.id !== previous.id)!;
    const rejoined = records.find((r) => r.id === previous.id)!;
    expect(created.groupId).toBeDefined();
    expect(created.groupId).toBe(rejoined.groupId);
    expect(created).toMatchObject({ payeeId: 'p1', taxPct: 10, date: '2026-09-05' });
    expect(created.estimatedValue).toBe(500);
    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(1);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR);
  });

  it('reports already-assigned, writing nothing, when the next day was claimed meanwhile', async () => {
    const previous = assignment();
    const claimed = assignment({ id: 'other', date: '2026-09-05', payeeId: 'p2' });
    await db.miningTaxAssignments.bulkPut([previous, claimed]);

    const result = await continueSession(continuation(previous), () => PRICES);

    expect(result).toMatchObject({ ok: false, reason: 'already-assigned' });
    expect(await db.miningTaxAssignments.get(previous.id)).toEqual(previous);
    expect(await stored()).toHaveLength(2);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('undoContinue', () => {
  it('removes the continued day (tombstoned) and un-combines a previous day that stood alone', async () => {
    const previous = assignment();
    await db.miningTaxAssignments.put(previous);
    const continued = await continueSession(continuation(previous), () => PRICES);
    if (!continued.ok) throw new Error('continue failed');
    syncMock.scheduleSync.mockClear();

    const result = await undoContinue(continued.value);

    expect(result.ok).toBe(true);
    const records = await stored();
    expect(records.map((r) => r.id)).toEqual([previous.id]);
    expect(records[0].groupId).toBeUndefined();
    expect(await tombstonedIds()).toEqual([continued.value.createdId]);
    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(1);
  });

  it('leaves a previous day that was already combined in its Combined Entry', async () => {
    const previous = assignment({ groupId: 'g1' });
    const earlier = assignment({ id: 'a0', date: '2026-09-03', groupId: 'g1' });
    await db.miningTaxAssignments.bulkPut([earlier, previous]);
    const continued = await continueSession(continuation(previous), () => PRICES);
    if (!continued.ok) throw new Error('continue failed');

    await undoContinue(continued.value);

    expect((await db.miningTaxAssignments.get(previous.id))?.groupId).toBe('g1');
    expect((await db.miningTaxAssignments.get(earlier.id))?.groupId).toBe('g1');
  });

  it('keeps what changed on the previous day since the continue, rather than restoring a stale copy', async () => {
    const previous = assignment();
    await db.miningTaxAssignments.put(previous);
    const continued = await continueSession(continuation(previous), () => PRICES);
    if (!continued.ok) throw new Error('continue failed');
    // A reload in between absorbed growth into the previous day.
    await db.miningTaxAssignments.update(previous.id, { estimatedValue: 1500, taxOwed: 150 });

    await undoContinue(continued.value);

    const after = await db.miningTaxAssignments.get(previous.id);
    expect(after).toMatchObject({ estimatedValue: 1500, taxOwed: 150 });
    expect(after?.groupId).toBeUndefined();
  });

  it('changes nothing when any part of the undo fails', async () => {
    const previous = assignment();
    await db.miningTaxAssignments.put(previous);
    const continued = await continueSession(continuation(previous), () => PRICES);
    if (!continued.ok) throw new Error('continue failed');
    const before = await stored();
    syncMock.scheduleSync.mockClear();
    vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('disk full'));

    const result = await undoContinue(continued.value);

    expect(result).toMatchObject({ ok: false, reason: 'save-failed' });
    expect(await stored()).toEqual(before);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('unassign', () => {
  it('unassigns every day of a Combined Entry in one write, tombstoning each', async () => {
    const members = [
      assignment({ id: 'a1', groupId: 'g1' }),
      assignment({ id: 'a2', date: '2026-09-05', groupId: 'g1' }),
    ];
    await db.miningTaxAssignments.bulkPut(members);

    const result = await unassign(members);

    expect(result.ok).toBe(true);
    expect(await stored()).toEqual([]);
    expect((await tombstonedIds()).sort()).toEqual(['a1', 'a2']);
    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(1);
  });

  it('leaves the whole Combined Entry in place when the write fails partway', async () => {
    const members = [
      assignment({ id: 'a1', groupId: 'g1' }),
      assignment({ id: 'a2', date: '2026-09-05', groupId: 'g1' }),
    ];
    await db.miningTaxAssignments.bulkPut(members);
    vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('disk full'));

    const result = await unassign(members);

    expect(result).toMatchObject({ ok: false, reason: 'save-failed' });
    expect(await stored()).toEqual(members);
    expect(await tombstonedIds()).toEqual([]);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('acceptNewTotal', () => {
  function grown(id: string, date: string): GroupMember {
    const a = assignment({
      id,
      date,
      groupId: 'g1',
      status: 'needs-review',
      paidAt: 5,
      reviewDiff: [{ typeId: ORE, before: 100, after: 150 }],
    });
    return { assignment: a, row: row(entry(date, 150), [a]) };
  }

  it('re-snapshots every grown day of a Combined Entry to its new total', async () => {
    const members = [grown('a1', '2026-09-04'), grown('a2', '2026-09-05')];
    await db.miningTaxAssignments.bulkPut(members.map((m) => m.assignment));

    const result = await acceptNewTotal(members);

    expect(result.ok).toBe(true);
    for (const r of await stored()) {
      expect(r).toMatchObject({ status: 'outstanding', estimatedValue: 1500, taxOwed: 150 });
      expect(r.oreLines).toEqual([{ typeId: ORE, quantity: 150 }]);
      expect(r.reviewDiff).toBeUndefined();
      expect(r.groupId).toBe('g1');
    }
    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when pricing any one day fails', async () => {
    const members = [grown('a1', '2026-09-04'), grown('a2', '2026-09-05')];
    await db.miningTaxAssignments.bulkPut(members.map((m) => m.assignment));
    pricingMock.loadUnitPricesOnDate
      .mockResolvedValueOnce({ prices: PRICES, unpriced: new Set() })
      .mockRejectedValueOnce(new Error('offline'));

    const result = await acceptNewTotal(members);

    expect(result).toMatchObject({ ok: false, reason: 'save-failed' });
    expect(await stored()).toEqual(members.map((m) => m.assignment));
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('uncombine', () => {
  it('takes days out of a Combined Entry without unassigning them', async () => {
    const members = [
      assignment({ id: 'a1', groupId: 'g1' }),
      assignment({ id: 'a2', date: '2026-09-05', groupId: 'g1' }),
    ];
    await db.miningTaxAssignments.bulkPut(members);

    const result = await uncombine(members);

    expect(result.ok).toBe(true);
    const records = await stored();
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.groupId === undefined && r.payeeId === 'p1')).toBe(true);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR);
  });
});

describe('every action', () => {
  it('schedules one sync per character it touched, after the write', async () => {
    const mine = assignment({ id: 'a1' });
    const theirs = assignment({ id: 'b1', characterId: 2 });
    await db.miningTaxAssignments.bulkPut([mine, theirs]);

    await settle([mine, theirs]);

    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(2);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(2);
  });

  it('writes and syncs nothing for an empty selection', async () => {
    expect(await dismiss([])).toEqual({ ok: true, value: [] });
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('turns a refused double claim into already-assigned, and any other error into save-failed', async () => {
    const input = {
      characterId: CHAR,
      date: '2026-09-04',
      solarSystemId: SYSTEM,
      payeeId: 'p1',
      oreLines: [{ typeId: ORE, quantity: 100 }],
      entryOreLines: [{ typeId: ORE, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      markPaid: false,
    };
    expect((await assign(input)).ok).toBe(true);
    expect(await assign(input)).toMatchObject({ ok: false, reason: 'already-assigned' });

    vi.spyOn(db.miningTaxAssignments, 'bulkPut').mockRejectedValueOnce(new Error('disk full'));
    const failed = await combine(
      [
        {
          characterId: CHAR,
          date: '2026-09-06',
          solarSystemId: SYSTEM,
          assignment: null,
          oreLines: [{ typeId: ORE, quantity: 1 }],
        },
      ],
      'p1',
      10,
      () => PRICES
    );
    expect(failed).toMatchObject({ ok: false, reason: 'save-failed' });
    expect(failed.ok === false && failed.cause).toBeInstanceOf(Error);
  });
});
