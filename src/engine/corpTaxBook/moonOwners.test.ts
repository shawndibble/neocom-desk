import { describe, expect, it } from 'vitest';
import {
  buildMoonOwners,
  canPayMoonOwner,
  deriveModeChanges,
  deriveOwnerRateHistory,
  billedPricesOf,
  extractionRefineriesOf,
  moonOwnerDetail,
  moonOwnerRefineryMining,
  staleLedgerMailDue,
  type MoonOwnerFeeder,
  type MoonOwnerPayout,
  type MoonOwnersInput,
} from './moonOwners';
import type { ObservedMiningEntry } from './types';

const BOOK = 98000000;
const A = 98000001;
const B = 98000002;
const NOW = '2026-10-20T12:00:00Z';

const feeder = (corporationId: number, over: Partial<MoonOwnerFeeder> = {}): MoonOwnerFeeder => ({
  corporationId,
  status: 'active',
  mode: 'normal',
  joinedAt: Date.parse('2026-10-01T10:00:00Z'),
  coveragePeriods: [{ from: '2026-10-01' }],
  lastReadWellAt: '2026-10-20T06:00:00Z',
  agreedRatePct: 8,
  payouts: [],
  ...over,
});

const payout = (id: string, date: string, amount: number, over: Partial<MoonOwnerPayout> = {}) =>
  ({
    id,
    date,
    amount,
    method: 'donation',
    status: 'matched',
    notAPayout: false,
    ...over,
  }) as const;

function entry(
  source: number | undefined,
  date: string,
  qty: number,
  over: Partial<ObservedMiningEntry> = {}
): ObservedMiningEntry {
  return {
    characterId: 1,
    recordedCorporationId: source ?? BOOK,
    structureId: source === A ? 10 : 20,
    date,
    ...(source !== undefined ? { sourceCorporationId: source } : {}),
    oreLines: [{ typeId: 100, quantity: qty }],
    ...over,
  };
}

function input(over: Partial<MoonOwnersInput> = {}): MoonOwnersInput {
  return {
    now: NOW,
    graceHours: 6,
    bookCorporationId: BOOK,
    rates: [{ scope: 'corp', pct: 12, effectiveFrom: '2026-01-01' }],
    entries: [entry(A, '2026-10-05', 1000)],
    feeders: [feeder(A)],
    pricesOn: () => new Map([[100, 1]]),
    ...over,
  };
}

const rowOf = (i: MoonOwnersInput, id = A) =>
  buildMoonOwners(i).rows.find((r) => r.id === String(id))!;
const statusOf = (over: Partial<MoonOwnerFeeder>) =>
  rowOf(input({ feeders: [feeder(A, over)] })).status;

describe('derive history', () => {
  it('uses the stored history when present', () => {
    const history = [
      {
        kind: 'agreed' as const,
        pct: 5,
        effectiveFrom: '2026-10-02',
        recordedAt: '2026-10-02T00:00:00Z',
      },
    ];
    expect(deriveOwnerRateHistory(feeder(A, { ownerRateHistory: history }))).toBe(history);
  });

  it('derives entries from the scalar rates, dated the join day', () => {
    const f = feeder(A, { requestedRatePct: 6, agreedRatePct: 8 });
    expect(deriveOwnerRateHistory(f).map((e) => [e.kind, e.pct, e.effectiveFrom])).toEqual([
      ['requested', 6, '2026-10-01'],
      ['agreed', 8, '2026-10-01'],
    ]);
  });

  it('derives a settled-otherwise change from mode when no list is stored', () => {
    expect(deriveModeChanges(feeder(A, { mode: 'settled-otherwise' }))).toEqual([
      { from: '2026-10-01', mode: 'settled-otherwise' },
    ]);
    expect(deriveModeChanges(feeder(A))).toEqual([]);
  });
});

describe('buildMoonOwners', () => {
  it('owes the rate times the value mined at their refineries, less payouts', () => {
    const r = rowOf(input({ feeders: [feeder(A, { payouts: [payout('p', '2026-10-10', 30)] })] }));
    expect(r.mined).toBe(1000);
    expect(r.owed).toBe(50);
    expect(r.theirRatePct).toBe(8);
  });

  it('ignores the book’s own refineries and other moon owners', () => {
    const r = rowOf(
      input({
        entries: [
          entry(A, '2026-10-05', 1000),
          entry(undefined, '2026-10-05', 500),
          entry(B, '2026-10-05', 700),
        ],
      })
    );
    expect(r.mined).toBe(1000);
  });

  it('counts distinct refineries', () => {
    const r = rowOf(
      input({
        entries: [
          entry(A, '2026-10-05', 10),
          entry(A, '2026-10-06', 10, { structureId: 11 }),
          entry(A, '2026-10-07', 10),
        ],
      })
    );
    expect(r.refineryCount).toBe(2);
  });

  it('owes nothing for days outside coverage, unread days, or with no rate', () => {
    expect(rowOf(input({ entries: [entry(A, '2026-09-20', 1000)] })).owed).toBe(0);
    const unread = feeder(A, { lastReadWellAt: '2026-10-05T01:00:00Z' });
    expect(rowOf(input({ feeders: [unread] })).owed).toBe(0);
    const none = rowOf(input({ feeders: [feeder(A, { agreedRatePct: undefined })] }));
    expect(none.owed).toBe(0);
    expect(none.status).toBe('no-rate');
    expect(none.theirRatePct).toBeUndefined();
  });

  it('settled otherwise owes nothing and says so', () => {
    const r = rowOf(input({ feeders: [feeder(A, { mode: 'settled-otherwise' })] }));
    expect(r.status).toBe('settled-otherwise');
    expect(r.owed).toBe(0);
    expect(canPayMoonOwner(r)).toBe(false);
  });

  it('settled otherwise from a later day keeps what accrued before it owed and payable', () => {
    const r = rowOf(
      input({
        entries: [entry(A, '2026-10-05', 1000), entry(A, '2026-10-12', 1000)],
        feeders: [feeder(A, { modeChanges: [{ from: '2026-10-10', mode: 'settled-otherwise' }] })],
      })
    );
    expect(r.status).toBe('settled-otherwise');
    expect(r.mode).toBe('settled-otherwise');
    expect(r.owed).toBe(80);
    expect(r.balance).toEqual({ kind: 'owed', isk: 80 });
    expect(canPayMoonOwner(r)).toBe(true);
  });

  it('a requested rate alone owes nothing yet, asks for a look, and backdates once agreed', () => {
    const asked = feeder(A, { agreedRatePct: undefined, requestedRatePct: 6 });
    const r = rowOf(input({ feeders: [asked] }));
    expect(r.owed).toBe(0);
    expect(r.status).toBe('rate-asked');
    expect(r.askedRatePct).toBe(6);
    expect(r.theirRatePct).toBeUndefined();
    expect(buildMoonOwners(input({ feeders: [asked] })).totals.needALook).toBe(1);
    const agreedLater = feeder(A, {
      ownerRateHistory: [
        {
          kind: 'requested',
          pct: 6,
          effectiveFrom: '2026-10-01',
          recordedAt: '2026-10-01T10:00:00Z',
        },
        { kind: 'agreed', pct: 6, effectiveFrom: '2026-10-15', recordedAt: '2026-10-15T10:00:00Z' },
      ],
    });
    const agreed = rowOf(input({ feeders: [agreedLater] }));
    expect(agreed.owed).toBe(60);
    expect(agreed.status).toBe('active');
  });

  it('a request newer than the agreed rate asks for a look; the agreed rate stands', () => {
    const r = rowOf(
      input({
        feeders: [
          feeder(A, {
            ownerRateHistory: [
              {
                kind: 'agreed',
                pct: 8,
                effectiveFrom: '2026-10-01',
                recordedAt: '2026-10-01T10:00:00Z',
              },
              {
                kind: 'requested',
                pct: 10,
                effectiveFrom: '2026-10-10',
                recordedAt: '2026-10-10T10:00:00Z',
              },
            ],
          }),
        ],
      })
    );
    expect(r.status).toBe('rate-asked');
    expect(r.askedRatePct).toBe(10);
    expect(r.theirRatePct).toBe(8);
    expect(r.owed).toBe(80);
  });

  it('shows the miner rate the book charges at their refineries', () => {
    const rates = [
      { scope: 'corp' as const, pct: 12, effectiveFrom: '2026-01-01' },
      { scope: 'feeder' as const, feederId: A, pct: 11, effectiveFrom: '2026-10-01' },
    ];
    expect(rowOf(input({ rates })).minerRatePct).toBe(11);
    expect(rowOf(input()).minerRatePct).toBe(12);
  });

  it('prices their miners as Guests, the way billing does', () => {
    const rates = [
      { scope: 'corp' as const, pct: 12, effectiveFrom: '2026-01-01' },
      { scope: 'guest' as const, pct: 15, effectiveFrom: '2026-01-01' },
    ];
    expect(rowOf(input({ rates })).minerRatePct).toBe(15);
  });

  it('reads a per-refinery rate at their refinery', () => {
    const rates = [
      { scope: 'corp' as const, pct: 12, effectiveFrom: '2026-01-01' },
      { scope: 'feeder' as const, feederId: A, pct: 11, effectiveFrom: '2026-01-01' },
      { scope: 'structure' as const, structureId: 10, pct: 9, effectiveFrom: '2026-01-01' },
    ];
    expect(rowOf(input({ rates })).minerRatePct).toBe(9);
  });

  it('shows the most common rate when it varies by refinery', () => {
    const rates = [
      { scope: 'corp' as const, pct: 12, effectiveFrom: '2026-01-01' },
      { scope: 'structure' as const, structureId: 11, pct: 9, effectiveFrom: '2026-01-01' },
    ];
    const entries = [
      entry(A, '2026-10-05', 1000),
      entry(A, '2026-10-06', 1000, { structureId: 11 }),
      entry(A, '2026-10-07', 1000, { structureId: 11 }),
    ];
    expect(rowOf(input({ rates, entries })).minerRatePct).toBe(9);
  });

  it('prices a moon owner with no ore yet as Guests', () => {
    const rates = [
      { scope: 'corp' as const, pct: 12, effectiveFrom: '2026-01-01' },
      { scope: 'guest' as const, pct: 15, effectiveFrom: '2026-01-01' },
    ];
    expect(rowOf(input({ rates, entries: [] })).minerRatePct).toBe(15);
  });

  it('ranks the status: removal pending, cannot read, settled, no rate, active', () => {
    const stale = Date.parse('2026-10-11T09:12:00Z');
    expect(statusOf({ status: 'pending-removal', staleSince: stale })).toBe('removal-pending');
    expect(statusOf({ staleSince: stale, mode: 'settled-otherwise' })).toBe('cant-read');
    expect(statusOf({ mode: 'settled-otherwise', agreedRatePct: undefined })).toBe(
      'settled-otherwise'
    );
    expect(statusOf({ agreedRatePct: undefined })).toBe('no-rate');
    expect(statusOf({ agreedRatePct: undefined, requestedRatePct: 5 })).toBe('rate-asked');
    expect(
      statusOf({ mode: 'settled-otherwise', agreedRatePct: undefined, requestedRatePct: 5 })
    ).toBe('settled-otherwise');
    expect(statusOf({})).toBe('active');
    expect(statusOf({ status: 'disconnected' })).toBe('disconnected');
  });

  it('reads since from coverage and until from the stale date', () => {
    expect(rowOf(input()).since).toBe('2026-10-01');
    expect(rowOf(input()).until).toBeUndefined();
    const stale = feeder(A, { staleSince: Date.parse('2026-10-11T09:12:00Z') });
    expect(rowOf(input({ feeders: [stale] })).until).toBe('2026-10-11');
  });

  it('lists a moon owner who left only while it is still owed', () => {
    const left = (payouts: MoonOwnerPayout[]) =>
      buildMoonOwners(
        input({
          feeders: [
            feeder(A, {
              status: 'left',
              coveragePeriods: [{ from: '2026-10-01', to: '2026-10-10' }],
              payouts,
            }),
          ],
        })
      ).rows.length;
    expect(left([])).toBe(1);
    expect(left([payout('p', '2026-10-11', 80)])).toBe(0);
  });

  it('totals owed, paid this month and what needs a look', () => {
    const { totals } = buildMoonOwners(
      input({
        entries: [entry(A, '2026-10-05', 1000), entry(B, '2026-10-05', 1000, { structureId: 30 })],
        feeders: [
          feeder(A, {
            payouts: [
              payout('p1', '2026-10-10', 20),
              payout('p2', '2026-10-11', 999, { notAPayout: true }),
              payout('p3', '2026-09-30', 5),
            ],
          }),
          feeder(B, { agreedRatePct: undefined }),
        ],
      })
    );
    expect(totals).toEqual({ owed: 55, paidThisMonth: 20, count: 2, needALook: 1 });
  });
});

describe('billed prices (#6209)', () => {
  it('keeps the first price a late notice listed each line at, by line', () => {
    const lines = (key: string, price: number) => ({
      lines: [{ key, unitPrices: { 100: price } }, { key: 'adjustment:a' }],
    });
    expect(billedPricesOf([lines('1:10:2026-10-05', 3), lines('1:10:2026-10-05', 9)])).toEqual(
      new Map([['1:10:2026-10-05', { 100: 3 }]])
    );
  });

  it('values ore with no saved price at the price its line was billed at, else 0', () => {
    const unsaved = input({
      entries: [entry(A, '2026-10-05', 1000), entry(A, '2026-10-06', 1000)],
      pricesOn: () => new Map([[100, 0]]),
      billedPrices: new Map([['1:10:2026-10-05', { 100: 2 }]]),
    });
    const r = rowOf(unsaved);
    expect(r.mined).toBe(2000);
    expect(r.owed).toBe(160);
  });
});

describe('moonOwnerDetail', () => {
  it('lists rate history and payouts newest first', () => {
    const d = moonOwnerDetail(
      input({
        feeders: [
          feeder(A, {
            ownerRateHistory: [
              {
                kind: 'requested',
                pct: 6,
                effectiveFrom: '2026-10-01',
                recordedAt: '2026-10-01T09:00:00Z',
              },
              {
                kind: 'agreed',
                pct: 8,
                effectiveFrom: '2026-10-01',
                recordedAt: '2026-10-01T11:00:00Z',
              },
            ],
            payouts: [payout('a', '2026-10-04', 8), payout('b', '2026-10-16', 12)],
          }),
        ],
      }),
      A
    )!;
    expect(d.history.map((h) => h.kind)).toEqual(['agreed', 'requested']);
    expect(d.requestedRatePct).toBe(6);
    expect(d.payouts.map((p) => p.id)).toEqual(['b', 'a']);
    expect(d.accrued).toBe(80);
    expect(d.paid).toBe(20);
  });

  it('groups mined ore by character and refinery', () => {
    const d = moonOwnerDetail(
      input({
        entries: [
          entry(A, '2026-10-05', 100),
          entry(A, '2026-10-06', 200),
          entry(A, '2026-10-06', 50, { characterId: 2 }),
        ],
      }),
      A
    )!;
    expect(d.mined).toEqual([
      { characterId: 1, structureId: 10, oreTypeIds: [100], quantity: 300, value: 300 },
      { characterId: 2, structureId: 10, oreTypeIds: [100], quantity: 50, value: 50 },
    ]);
  });

  it('carries a pending removal and whether a payee is on record', () => {
    const removal = { startedAt: 5, startedByName: 'Kestrel', effectiveAt: 9 };
    const pending = moonOwnerDetail(
      input({
        feeders: [
          feeder(A, { status: 'pending-removal', removal, payee: { kind: 'character', id: 3 } }),
        ],
      }),
      A
    );
    expect(pending?.removal).toEqual(removal);
    expect(pending?.hasPayee).toBe(true);
    const active = moonOwnerDetail(input({ feeders: [feeder(A, { removal })] }), A);
    expect(active?.removal).toBeUndefined();
    expect(active?.hasPayee).toBe(false);
  });

  it('pays the moon owner itself unless a payee is set, with the days since the last payment', () => {
    const plain = moonOwnerDetail(
      input({ entries: [entry(A, '2026-10-05', 100), entry(A, '2026-10-12', 100)] }),
      A
    )!;
    expect(plain.payee).toEqual({ kind: 'corporation', id: A });
    expect(plain.period).toEqual({ from: '2026-10-05', to: '2026-10-12' });
    const set = moonOwnerDetail(
      input({
        entries: [entry(A, '2026-10-05', 100), entry(A, '2026-10-12', 100)],
        feeders: [
          feeder(A, {
            payee: { kind: 'character', id: 7 },
            payouts: [payout('a', '2026-10-06', 1)],
          }),
        ],
      }),
      A
    )!;
    expect(set.payee).toEqual({ kind: 'character', id: 7 });
    expect(set.period).toEqual({ from: '2026-10-12', to: '2026-10-12' });
  });

  it('is undefined for a corporation that is not a moon owner', () => {
    expect(moonOwnerDetail(input(), 5)).toBeUndefined();
  });
});

describe('a same-owner moon owner', () => {
  const mine = feeder(A, {
    sameOwner: true,
    mode: 'settled-otherwise',
    modeChanges: [{ from: '2026-10-01', mode: 'settled-otherwise' }],
    agreedRatePct: undefined,
  });

  it('reads as settled otherwise: owed nothing, not payable, not a thing to look at', () => {
    const { rows, totals } = buildMoonOwners(input({ feeders: [mine] }));
    expect(rows[0]).toMatchObject({
      status: 'settled-otherwise',
      mode: 'settled-otherwise',
      owed: 0,
      sameOwner: true,
    });
    expect(canPayMoonOwner(rows[0]!)).toBe(false);
    expect(totals.needALook).toBe(0);
    expect(totals.owed).toBe(0);
  });

  it('stays settled even if the stored mode somehow says normal', () => {
    const odd = { ...mine, mode: 'normal' as const, modeChanges: undefined };
    expect(buildMoonOwners(input({ feeders: [odd] })).rows[0]).toMatchObject({
      status: 'settled-otherwise',
      owed: 0,
      sameOwner: true,
    });
  });

  it('carries the flag into the detail, and a normal owner has none', () => {
    expect(moonOwnerDetail(input({ feeders: [mine] }), A)?.row.sameOwner).toBe(true);
    expect(buildMoonOwners(input()).rows[0]).not.toHaveProperty('sameOwner');
  });
});

describe('refineries seen (#6097)', () => {
  const extractions = extractionRefineriesOf([
    { structureId: 10, sourceCorporationId: A },
    { structureId: 11, sourceCorporationId: A },
    { structureId: 30, sourceCorporationId: B },
    // The book's own Extraction belongs to no moon owner.
    { structureId: 99 },
  ]);

  it('counts the union of the ledger refineries and the Extraction refineries', () => {
    // The ledger has refinery 10; the Extractions have 10 and 11.
    const row = rowOf(input({ extractionRefineries: extractions }));
    expect(row.refineryCount).toBe(2);
    expect(row.nothingSeen).toBeUndefined();
  });

  it('counts a refinery nobody has mined at yet, and leaves Mined to the ledger', () => {
    const row = rowOf(
      input({ entries: [], feeders: [feeder(B)], extractionRefineries: extractions }),
      B
    );
    expect(row).toMatchObject({ refineryCount: 1, mined: 0 });
    expect(row.nothingSeen).toBeUndefined();
  });

  it('says nothing was seen yet for a corporation with no ledger row and no Extraction', () => {
    const row = rowOf(input({ entries: [], extractionRefineries: new Map() }));
    expect(row).toMatchObject({ refineryCount: 0, nothingSeen: true });
    expect(rowOf(input({ entries: [] })).nothingSeen).toBe(true);
  });
});

describe('a removal waiting on its notice mail (#6210)', () => {
  const startedAt = Date.parse('2026-10-19T12:00:00Z');

  it('reads as its own status until the notice is out, and asks for a look', () => {
    const unsent = feeder(A, {
      status: 'pending-removal',
      removal: { startedAt, startedByName: 'Ada' },
    });
    expect(rowOf(input({ feeders: [unsent] })).status).toBe('removal-unsent');
    expect(buildMoonOwners(input({ feeders: [unsent] })).totals.needALook).toBe(1);
    const sent = feeder(A, {
      status: 'pending-removal',
      removal: { startedAt, startedByName: 'Ada', effectiveAt: startedAt + 86_400_000 },
    });
    expect(rowOf(input({ feeders: [sent] })).status).toBe('removal-pending');
  });
});

describe('staleLedgerMailDue (#6210)', () => {
  const staleSince = Date.parse('2026-10-11T09:12:00Z');
  const now = '2026-10-20T12:00:00Z';

  it('is due while a ledger it still reads, or just lost, cannot be read', () => {
    expect(staleLedgerMailDue({ status: 'cant-read', staleSince }, now)).toBe(true);
    expect(staleLedgerMailDue({ status: 'removal-pending', staleSince }, now)).toBe(true);
    expect(staleLedgerMailDue({ status: 'disconnected', staleSince }, now)).toBe(true);
  });

  it('is not due when it reads, has ended, or is one of our own corporations', () => {
    expect(staleLedgerMailDue({ status: 'active' }, now)).toBe(false);
    expect(staleLedgerMailDue({ status: 'left', staleSince }, now)).toBe(false);
    expect(staleLedgerMailDue({ status: 'removed', staleSince }, now)).toBe(false);
    expect(staleLedgerMailDue({ status: 'cant-read', staleSince, sameOwner: true }, now)).toBe(
      false
    );
  });

  it('is not due once EVE dropped the first unread day: reconnecting can no longer save it', () => {
    const row = {
      status: 'disconnected' as const,
      staleSince,
      lastReadWellAt: '2026-10-10T12:00:00Z',
    };
    expect(staleLedgerMailDue(row, '2026-11-09T01:00:00Z')).toBe(true);
    expect(staleLedgerMailDue(row, '2026-11-10T01:00:00Z')).toBe(false);
  });
});

describe("the moon owner's own members' rate (#6210)", () => {
  const rates = [
    { scope: 'corp' as const, pct: 12, effectiveFrom: '2026-01-01' },
    { scope: 'guest' as const, pct: 15, effectiveFrom: '2026-01-01' },
    { scope: 'feeder-member' as const, feederId: A, pct: 4, effectiveFrom: '2026-01-01' },
  ];

  it("shows what the owner's members pay at its refineries", () => {
    // The default entry is recorded in the moon owner's own corporation.
    expect(rowOf(input({ rates })).minerRatePct).toBe(4);
    const guest = entry(A, '2026-10-05', 1000, { recordedCorporationId: 98000555 });
    expect(rowOf(input({ rates, entries: [guest] })).minerRatePct).toBe(15);
  });
});

describe('moonOwnerRefineryMining', () => {
  it('lists covered entries by day, valued at 100%, and knows no stranger', () => {
    const lines = moonOwnerRefineryMining(
      input({ entries: [entry(A, '2026-10-05', 1000), entry(A, '2026-09-05', 500)] }),
      A
    );
    expect(lines).toEqual([
      { structureId: 10, characterId: 1, date: '2026-10-05', quantity: 1000, value: 1000 },
    ]);
    expect(moonOwnerRefineryMining(input(), B)).toBeUndefined();
  });
});
