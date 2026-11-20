import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord, type PayeeRecord } from '@/db';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { readTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_ASSIGNMENTS, PAYEES } from '@/sync/syncedCollections';
import { coalesceAssignments } from './coalesce';
import { loadDefaultOptOuts, useDefaultOptOuts } from './defaultOptOuts';
import type { GroupMember, DisplayRow } from './groupRows';
import type { SessionContinuation } from './sessionContinuation';
import type { MoonMiningTaxRow } from './snapshot';
import {
  acceptNewTotal,
  assign,
  assignmentsMovedWithPayee,
  combine,
  continueSession,
  deletePayee,
  dismiss,
  recordCorpPayment,
  HeldElsewhereError,
  settle,
  unassign,
  uncombine,
  undoContinue,
  unsettleByIds,
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
  useDefaultOptOuts.setState({ value: [], hydrated: false });
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
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR, {
      collections: ['miningTaxAssignments', 'payees'],
    });
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

  it('remembers the entry so a Default System does not assign it again', async () => {
    const row = assignment({ id: 'a1', override: false });
    await db.miningTaxAssignments.put(row);

    await unassign([row]);

    expect(await loadDefaultOptOuts()).toEqual(new Set([`${CHAR}|2026-09-04|${SYSTEM}`]));
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
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR, {
      collections: ['miningTaxAssignments', 'payees'],
    });
  });
});

describe('every action', () => {
  it('schedules one sync per character it touched, after the write', async () => {
    const mine = assignment({ id: 'a1' });
    const theirs = assignment({ id: 'b1', characterId: 2 });
    await db.miningTaxAssignments.bulkPut([mine, theirs]);

    await settle([mine, theirs]);

    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(2);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR, {
      collections: ['miningTaxAssignments', 'payees'],
    });
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(2, {
      collections: ['miningTaxAssignments', 'payees'],
    });
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

describe('deletePayee', () => {
  const payeeA: PayeeRecord = {
    id: 'p1',
    characterId: CHAR,
    name: 'A',
    defaultTaxPct: 10,
    updatedAt: 1,
  };
  const payeeB: PayeeRecord = {
    id: 'p2',
    characterId: CHAR,
    name: 'B',
    defaultTaxPct: 10,
    updatedAt: 1,
  };
  const payment: MiningTaxAssignmentRecord['payment'] = {
    paymentId: 'pay1',
    paidOn: '2026-09-06',
    method: 'donation',
    amount: 100,
  };

  /** One Combined Entry under A: a day settled oldest-first, and a day still owed. */
  const paidDay = assignment({ id: 'g1', groupId: 'g', status: 'paid', payment });
  const owedDay = assignment({ id: 'g2', groupId: 'g', date: '2026-09-05' });

  beforeEach(async () => {
    await db.payees.bulkPut([payeeA, payeeB]);
  });

  it('moves every day of a Combined Entry with an owed day, keeping each status, and coalesce leaves it whole', async () => {
    await db.miningTaxAssignments.bulkPut([paidDay, owedDay]);

    expect(await deletePayee(payeeA, 'p2')).toEqual({ ok: true, value: undefined });

    const after = await stored();
    expect(after.map((a) => [a.id, a.payeeId, a.status, a.groupId])).toEqual(
      expect.arrayContaining([
        ['g1', 'p2', 'paid', 'g'],
        ['g2', 'p2', 'outstanding', 'g'],
      ])
    );
    expect(after.find((a) => a.id === 'g1')!.payment).toEqual(payment);
    expect(await db.payees.get('p1')).toBeUndefined();
    expect((await readTombstones(tombstoneKey(PAYEES, CHAR))).map((t) => t.id)).toEqual(['p1']);
    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(1);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR, {
      collections: ['miningTaxAssignments', 'payees'],
    });

    await coalesceAssignments(CHAR);
    expect((await stored()).every((a) => a.groupId === 'g')).toBe(true);
  });

  it('leaves standalone paid days, and Combined Entries with nothing owed, where they are', async () => {
    const standalonePaid = assignment({ id: 's1', date: '2026-09-01', status: 'paid', payment });
    const settledGroup = [
      assignment({ id: 'h1', groupId: 'h', date: '2026-08-01', status: 'paid', payment }),
      assignment({ id: 'h2', groupId: 'h', date: '2026-08-02', status: 'paid', payment }),
    ];
    await db.miningTaxAssignments.bulkPut([standalonePaid, ...settledGroup, owedDay]);

    expect((await deletePayee(payeeA, 'p2')).ok).toBe(true);

    const payeeOf = new Map((await stored()).map((a) => [a.id, a.payeeId]));
    expect(Object.fromEntries(payeeOf)).toEqual({ s1: 'p1', h1: 'p1', h2: 'p1', g2: 'p2' });
  });

  it('changes nothing and syncs nothing when the Payee delete fails after the move', async () => {
    await db.miningTaxAssignments.bulkPut([paidDay, owedDay]);
    vi.spyOn(db.payees, 'delete').mockRejectedValueOnce(new Error('disk full'));

    expect(await deletePayee(payeeA, 'p2')).toMatchObject({ ok: false, reason: 'save-failed' });

    expect((await stored()).every((a) => a.payeeId === 'p1')).toBe(true);
    expect(await db.payees.get('p1')).toEqual(payeeA);
    expect(await readTombstones(tombstoneKey(PAYEES, CHAR))).toEqual([]);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('deletes only the Payee when there is nowhere to move its entries', async () => {
    await db.miningTaxAssignments.bulkPut([owedDay]);

    expect((await deletePayee(payeeA)).ok).toBe(true);

    expect((await stored())[0].payeeId).toBe('p1');
    expect(await db.payees.get('p1')).toBeUndefined();
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR, {
      collections: ['miningTaxAssignments', 'payees'],
    });
  });

  it('counts what a move takes: owed days plus the rest of their Combined Entries', () => {
    const elsewhere = assignment({ id: 'x1', payeeId: 'p2', groupId: 'g' });
    expect(
      assignmentsMovedWithPayee([paidDay, owedDay, elsewhere], 'p1')
        .map((a) => a.id)
        .sort()
    ).toEqual(['g1', 'g2']);
  });
});

describe('unsettleByIds', () => {
  it('reverts Paid Assignments the caller only knows by id', async () => {
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'a1', status: 'paid', paidAt: 5 }),
      assignment({ id: 'a2', status: 'paid', paidAt: 5 }),
    ]);

    const result = await unsettleByIds(['a1']);

    expect(result.ok).toBe(true);
    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('outstanding');
    expect((await db.miningTaxAssignments.get('a2'))?.status).toBe('paid');
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR, expect.anything());
  });

  it('fails when no id matches a stored Assignment', async () => {
    const result = await unsettleByIds(['missing']);

    expect(result.ok).toBe(false);
  });
});

describe('recordCorpPayment', () => {
  const CORP = { corporationId: 98000001, name: 'Bureau' };
  function bookRow(overrides: Partial<BookRowView> = {}): BookRowView {
    return {
      id: 'book:1',
      corporationId: CORP.corporationId,
      corpName: CORP.name,
      characterId: CHAR,
      date: '2026-09-04',
      solarSystemId: SYSTEM,
      state: 'billed',
      oreLines: [{ typeId: ORE, quantity: 100 }],
      unitPrices: { [ORE]: 10 },
      priceSources: {},
      taxPct: 10,
      rateScope: 'corp',
      estimatedValue: 1000,
      taxOwed: 100,
      billed: 100,
      hubId: 'jita',
      oreForm: 'raw',
      ...overrides,
    };
  }
  const payee = (id: string): PayeeRecord => ({
    id,
    characterId: CHAR,
    name: id,
    defaultTaxPct: 10,
    updatedAt: 1,
  });
  const PAYMENT = { paidOn: '2026-09-05', method: 'contract' as const, amount: 100 };

  it('records the row paid under a new Payee verified as the corporation', async () => {
    const result = await recordCorpPayment(CORP, [bookRow()], PAYMENT);

    expect(result.ok).toBe(true);
    const [payee] = await db.payees.toArray();
    expect(payee).toMatchObject({
      characterId: CHAR,
      name: 'Bureau',
      entityId: CORP.corporationId,
      entityKind: 'corporation',
    });
    const [paid] = await db.miningTaxAssignments.toArray();
    expect(paid).toMatchObject({
      payeeId: payee.id,
      date: '2026-09-04',
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ORE, quantity: 100 }],
      taxOwed: 100,
      status: 'paid',
      payment: expect.objectContaining({ method: 'contract', paidOn: '2026-09-05' }),
    });
  });

  it('reuses the verified corporation Payee, never one that only shares its name', async () => {
    const sameName: PayeeRecord = { ...payee('p1'), name: 'Bureau' };
    const verified: PayeeRecord = {
      ...payee('p2'),
      name: 'Bureau',
      entityId: CORP.corporationId,
      entityKind: 'corporation',
    };
    await db.payees.bulkPut([sameName, verified]);

    await recordCorpPayment(CORP, [bookRow()]);

    expect(await db.payees.count()).toBe(2);
    const [paid] = await db.miningTaxAssignments.toArray();
    expect(paid).toMatchObject({ payeeId: 'p2', status: 'paid' });
    expect(paid.payment).toBeUndefined();
  });

  it('records only the ore the member has not already marked paid', async () => {
    const verified: PayeeRecord = {
      ...payee('p2'),
      entityId: CORP.corporationId,
      entityKind: 'corporation',
    };
    await db.payees.put(verified);
    await db.miningTaxAssignments.put(
      assignment({
        id: 'mark',
        payeeId: 'p2',
        status: 'paid',
        oreLines: [{ typeId: ORE, quantity: 40 }],
      })
    );

    await recordCorpPayment(CORP, [
      bookRow({
        markedPaidIds: ['mark'],
        taxOwed: 60,
        personalOreLines: [{ typeId: ORE, quantity: 100 }],
      }),
    ]);

    const added = (await db.miningTaxAssignments.toArray()).find((a) => a.id !== 'mark');
    expect(added).toMatchObject({ oreLines: [{ typeId: ORE, quantity: 60 }], taxOwed: 60 });
  });

  it("marks the member's own owed Assignment under the corporation paid, not a second claim", async () => {
    await db.payees.put({
      ...payee('p2'),
      entityId: CORP.corporationId,
      entityKind: 'corporation',
    });
    await db.miningTaxAssignments.put(assignment({ id: 'own', payeeId: 'p2' }));

    const result = await recordCorpPayment(
      CORP,
      [bookRow({ personalOreLines: [{ typeId: ORE, quantity: 100 }] })],
      PAYMENT
    );

    expect(result.ok).toBe(true);
    const all = await db.miningTaxAssignments.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'own', status: 'paid', payment: expect.anything() });
  });

  it('pays every owed day of a Combined Entry one ticked row reaches, under one payment', async () => {
    await db.payees.put({
      ...payee('p2'),
      entityId: CORP.corporationId,
      entityKind: 'corporation',
    });
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'day1', payeeId: 'p2', groupId: 'g' }),
      assignment({ id: 'day2', payeeId: 'p2', groupId: 'g', date: '2026-09-05' }),
      assignment({ id: 'other', payeeId: 'p2', groupId: 'h', date: '2026-09-06' }),
      assignment({ id: 'stale', payeeId: 'p1', groupId: 'g', date: '2026-09-03' }),
    ]);

    // The ISK sent covers the ticked row and the Combined Entry's other day.
    const result = await recordCorpPayment(
      CORP,
      [bookRow({ personalOreLines: [{ typeId: ORE, quantity: 100 }] })],
      { ...PAYMENT, amount: 200 }
    );

    expect(result.ok).toBe(true);
    const byId = new Map((await db.miningTaxAssignments.toArray()).map((a) => [a.id, a]));
    expect(byId.size).toBe(4);
    expect(byId.get('day1')?.status).toBe('paid');
    expect(byId.get('day2')?.status).toBe('paid');
    expect(byId.get('day2')?.payment?.paymentId).toBe(byId.get('day1')?.payment?.paymentId);
    expect(byId.get('other')?.status).toBe('outstanding');
    expect(byId.get('stale')?.status).toBe('outstanding');
  });

  // The Bureau report: a payment never marks a day its amount does not cover.
  it('leaves owed a Combined Entry day the ISK sent does not reach', async () => {
    await db.payees.put({
      ...payee('p2'),
      entityId: CORP.corporationId,
      entityKind: 'corporation',
    });
    await db.miningTaxAssignments.bulkPut([
      assignment({ id: 'day1', payeeId: 'p2', groupId: 'g' }),
      assignment({ id: 'day2', payeeId: 'p2', groupId: 'g', date: '2026-09-05' }),
    ]);

    const result = await recordCorpPayment(
      CORP,
      [bookRow({ personalOreLines: [{ typeId: ORE, quantity: 100 }] })],
      PAYMENT
    );

    expect(result.ok).toBe(true);
    const byId = new Map((await db.miningTaxAssignments.toArray()).map((a) => [a.id, a]));
    expect(byId.get('day1')?.status).toBe('paid');
    expect(byId.get('day2')?.status).toBe('outstanding');
  });

  it('marks only the ticked rows the amount covers, oldest first', async () => {
    const result = await recordCorpPayment(
      CORP,
      [
        bookRow({ id: 'book:2', date: '2026-09-05', taxOwed: 100 }),
        bookRow({ id: 'book:1', date: '2026-09-04', taxOwed: 100 }),
      ],
      PAYMENT
    );

    expect(result.ok).toBe(true);
    const paid = await db.miningTaxAssignments.toArray();
    expect(paid.map((a) => [a.date, a.status])).toEqual([['2026-09-04', 'paid']]);
  });

  it('records only the share of the day a short payment pays, so the rest stays owed', async () => {
    const result = await recordCorpPayment(CORP, [bookRow()], { ...PAYMENT, amount: 60 });

    expect(result.ok).toBe(true);
    const [part] = await db.miningTaxAssignments.toArray();
    expect(part).toMatchObject({
      status: 'paid',
      oreLines: [{ typeId: ORE, quantity: 60 }],
      taxOwed: 60,
    });
  });

  it("counts a payment within the book's day tolerance as paying the whole day", async () => {
    const row = bookRow({ taxOwed: 1_000_000, billed: 1_000_000 });
    await recordCorpPayment(CORP, [row], { ...PAYMENT, amount: 999_900 });

    const [paid] = await db.miningTaxAssignments.toArray();
    expect(paid).toMatchObject({ status: 'paid', oreLines: [{ typeId: ORE, quantity: 100 }] });
  });

  it('pays the covered days whole and part-pays the next one with what is left', async () => {
    await recordCorpPayment(
      CORP,
      [
        bookRow({ id: 'book:1', date: '2026-09-04' }),
        bookRow({ id: 'book:2', date: '2026-09-05' }),
      ],
      { ...PAYMENT, amount: 130 }
    );

    const byDate = new Map((await db.miningTaxAssignments.toArray()).map((a) => [a.date, a]));
    expect(byDate.get('2026-09-04')).toMatchObject({ taxOwed: 100, status: 'paid' });
    expect(byDate.get('2026-09-05')).toMatchObject({ taxOwed: 30, status: 'paid' });
  });

  it('records two rows on one entry (two refineries, same ore) in full, each once', async () => {
    const result = await recordCorpPayment(CORP, [
      bookRow({
        id: 'book:a',
        oreLines: [{ typeId: ORE, quantity: 60 }],
        personalOreLines: [{ typeId: ORE, quantity: 100 }],
      }),
      bookRow({
        id: 'book:b',
        oreLines: [{ typeId: ORE, quantity: 40 }],
        personalOreLines: [{ typeId: ORE, quantity: 100 }],
      }),
    ]);

    expect(result.ok).toBe(true);
    const all = await db.miningTaxAssignments.toArray();
    expect(all.map((a) => a.oreLines[0].quantity).sort()).toEqual([40, 60]);
    expect(all.every((a) => a.status === 'paid')).toBe(true);
  });

  it("splits the member's own owed corp Assignment across two rows on its entry, marking it once", async () => {
    await db.payees.put({
      ...payee('p2'),
      entityId: CORP.corporationId,
      entityKind: 'corporation',
    });
    await db.miningTaxAssignments.put(
      assignment({ id: 'own', payeeId: 'p2', oreLines: [{ typeId: ORE, quantity: 70 }] })
    );
    const markSpy = vi.spyOn(db.miningTaxAssignments, 'bulkPut');

    const result = await recordCorpPayment(CORP, [
      bookRow({
        id: 'book:a',
        oreLines: [{ typeId: ORE, quantity: 60 }],
        personalOreLines: [{ typeId: ORE, quantity: 100 }],
      }),
      bookRow({
        id: 'book:b',
        oreLines: [{ typeId: ORE, quantity: 40 }],
        personalOreLines: [{ typeId: ORE, quantity: 100 }],
      }),
    ]);

    expect(result.ok).toBe(true);
    const all = await db.miningTaxAssignments.toArray();
    expect(all.find((a) => a.id === 'own')?.status).toBe('paid');
    const added = all.filter((a) => a.id !== 'own');
    expect(added.map((a) => a.oreLines)).toEqual([[{ typeId: ORE, quantity: 30 }]]);
    const marked = markSpy.mock.calls.at(-1)?.[0] as MiningTaxAssignmentRecord[];
    expect(marked.filter((a) => a.id === 'own')).toHaveLength(1);
    markSpy.mockRestore();
  });

  it('refuses, naming the row, when another Payee already holds its ore (an overlap)', async () => {
    await db.miningTaxAssignments.put(assignment({ id: 'personal', payeeId: 'p1' }));

    const result = await recordCorpPayment(CORP, [
      bookRow({ id: 'book:a', personalOreLines: [{ typeId: ORE, quantity: 100 }] }),
    ]);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('held-elsewhere');
    expect(!result.ok && (result.cause as HeldElsewhereError).rows).toEqual([
      { id: 'book:a', date: '2026-09-04' },
    ]);
    expect(await db.miningTaxAssignments.toArray()).toEqual([
      expect.objectContaining({ id: 'personal', status: 'outstanding' }),
    ]);
  });

  it("refuses a row whose ore the member's own corp Assignment holds for Needs review", async () => {
    await db.payees.put({
      ...payee('p2'),
      entityId: CORP.corporationId,
      entityKind: 'corporation',
    });
    await db.miningTaxAssignments.put(
      assignment({ id: 'review', payeeId: 'p2', status: 'needs-review' })
    );

    const result = await recordCorpPayment(CORP, [
      bookRow({ personalOreLines: [{ typeId: ORE, quantity: 100 }] }),
    ]);

    expect(!result.ok && result.reason).toBe('held-elsewhere');
    expect((await db.miningTaxAssignments.get('review'))?.status).toBe('needs-review');
    expect(await db.miningTaxAssignments.count()).toBe(1);
  });

  it('skips a row that never lined up with a ledger entry', async () => {
    const result = await recordCorpPayment(CORP, [bookRow({ solarSystemId: 0 })]);

    expect(result.ok).toBe(true);
    expect(await db.miningTaxAssignments.count()).toBe(0);
  });
});
