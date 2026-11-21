import { describe, expect, it } from 'vitest';
import {
  combineOverlaps,
  inFlightDonations,
  overlayCorpBooks,
  previewTakeover,
  type PersonalBook,
  type PersonalEntry,
} from './personal';
import { NOTICE_ID_FIELD, type LateNotice } from '../../../functions/src/corpTaxBookLateNotice';
import type { Declaration } from './overdue';
import type { OreDispute } from './disputes';

const CORP = 98000001;
const ME = 90000001;
const SYSTEM = 30003838;
const ZEO = 45490;
const SYL = 45491;

const NOW = '2026-10-18T14:00:00Z';
/** Past a 2026-10-17 Conflict's 14 days: the book's share of it is owed. */
const LATE = '2026-11-05T14:00:00Z';
// Synced 2h ago: every day through 17 Oct is Billable (day end + 6h grace, then a sync).
const SYNCED = '2026-10-18T12:00:00Z';

const entry = (over: Partial<PersonalEntry> = {}): PersonalEntry => ({
  characterId: ME,
  date: '2026-10-17',
  solarSystemId: SYSTEM,
  oreLines: [{ typeId: ZEO, quantity: 41_200 }],
  freeOreLines: [{ typeId: ZEO, quantity: 41_200 }],
  allocations: [],
  ...over,
});

const book = (over: Partial<PersonalBook> = {}): PersonalBook => ({
  corporationId: CORP,
  corpName: 'Brass Meridian Logistics',
  startDate: '2026-10-01',
  lastSyncedAt: SYNCED,
  rates: [{ scope: 'corp', pct: 15, effectiveFrom: '2026-10-01' }],
  miners: [],
  observed: [
    {
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date: '2026-10-17',
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 43_050 }],
    },
  ],
  dismissals: [],
  notices: [],
  payments: [],
  hubId: 'jita',
  oreForm: 'compressed',
  pricesOn: () => ({
    prices: new Map([
      [ZEO, 148],
      [SYL, 100],
    ]),
    sources: new Map([
      [ZEO, 'saved'],
      [SYL, 'saved'],
    ]),
  }),
  inFlight: [],
  ...over,
});

/** The book's tax on the default day: 43,050 Zeolites at 148 ISK and 15%. */
const DAY = 43_050 * 148 * 0.15;

/** A Late notice asking for `lines` (the default day's charge by default). */
const noticeOf = (over: Partial<LateNotice> = {}): LateNotice => {
  const lines = over.lines ?? [
    {
      kind: 'mined' as const,
      date: '2026-10-17',
      key: `${ME}:1000:2026-10-17`,
      characterId: ME,
      structureId: 1000,
      oreLines: [{ typeId: ZEO, quantity: 43_050 }],
      estimatedValue: DAY / 0.15,
      tax: DAY,
    },
  ];
  return {
    id: 'n1',
    minerId: `solo:${ME}`,
    characterIds: [ME],
    kind: 'late',
    issuedAt: '2026-10-18T00:00:00Z',
    code: 'MTABCDEF',
    uids: [],
    listed: lines.reduce((sum, l) => sum + l.tax, 0),
    mail: { sent: 1, manualSent: 0, remindersStopped: false },
    ...over,
    lines,
  };
};

const overlay = (entries: PersonalEntry[], books: PersonalBook[], now = NOW) =>
  overlayCorpBooks({ entries, books, now });

describe('overlayCorpBooks', () => {
  it('leaves the personal tab alone with no book', () => {
    const out = overlay([entry()], []);
    expect(out.rows).toEqual([]);
    expect(out.takenFromFree.size).toBe(0);
    expect(out.labels.size).toBe(0);
  });

  it('bills a Billable day at the book quantity, price and rate, and takes it from the free ore', () => {
    const out = overlay([entry()], [book()]);
    expect(out.rows).toHaveLength(1);
    const row = out.rows[0];
    expect(row.state).toBe('billed');
    expect(row.oreLines).toEqual([{ typeId: ZEO, quantity: 43_050 }]);
    expect(row.estimatedValue).toBe(43_050 * 148);
    expect(row.taxPct).toBe(15);
    expect(row.rateScope).toBe('corp');
    expect(row.rateEffectiveFrom).toBe('2026-10-01');
    expect(row.taxOwed).toBeCloseTo(43_050 * 148 * 0.15, 4);
    // The corp took the unassigned ore, so the personal residual row has nothing left.
    expect(out.takenFromFree.get(`${ME}:2026-10-17:${SYSTEM}`)).toEqual([
      { typeId: ZEO, quantity: 41_200 },
    ]);
  });

  it('flags a difference from the member record as disputed', () => {
    const out = overlay([entry()], [book()]);
    expect(out.rows[0].personalOreLines).toEqual([{ typeId: ZEO, quantity: 41_200 }]);
    expect(out.rows[0].dispute).toMatchObject({
      quantity: true,
      personalQuantity: 41_200,
      bookQuantity: 43_050,
    });
  });

  it('is not disputed when quantity and rate agree', () => {
    const out = overlay(
      [
        entry({
          oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          freeOreLines: [{ typeId: ZEO, quantity: 43_050 }],
        }),
      ],
      [book()]
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].state).toBe('billed');
    expect(out.rows[0].dispute).toBeUndefined();
  });

  it('compares the rate the member allocated the day at', () => {
    const out = overlay(
      [
        entry({
          oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          freeOreLines: [],
          allocations: [
            {
              payeeId: 'other',
              taxPct: 10,
              oreLines: [{ typeId: ZEO, quantity: 43_050 }],
              status: 'outstanding',
            },
          ],
        }),
      ],
      [book({ startDate: '2026-10-01' })]
    );
    const conflict = out.rows[0];
    expect(conflict.state).toBe('conflict');
    expect(conflict.dispute).toMatchObject({ rate: true, personalPct: 10, bookPct: 15 });
  });

  it('shows only a Pending corp record hint before the day is Billable, never owed', () => {
    const out = overlay(
      [entry({ date: '2026-10-18' })],
      [
        book({
          observed: [
            {
              characterId: ME,
              recordedCorporationId: CORP,
              structureId: 1000,
              date: '2026-10-18',
              solarSystemId: SYSTEM,
              oreLines: [{ typeId: ZEO, quantity: 1000 }],
            },
          ],
        }),
      ]
    );
    expect(out.rows).toEqual([]);
    expect(out.takenFromFree.size).toBe(0);
    expect(out.labels.get(`${ME}:2026-10-18:${SYSTEM}`)).toMatchObject({
      state: 'pending',
      corporationId: CORP,
    });
  });

  it('is pending until an officer syncs after the grace period', () => {
    const out = overlay([entry()], [book({ lastSyncedAt: '2026-10-18T00:10:00Z' })]);
    expect(out.rows).toEqual([]);
    expect(out.labels.get(`${ME}:2026-10-17:${SYSTEM}`)?.state).toBe('pending');
  });

  it('owes nothing for mining before the book started', () => {
    const out = overlay([entry()], [book({ startDate: '2026-10-18' })]);
    expect(out.rows).toEqual([]);
    expect(out.labels.size).toBe(0);
  });

  it('marks the free ore a book did not claim as Unattributed once the day is closed', () => {
    const out = overlay(
      [
        entry({
          oreLines: [
            { typeId: ZEO, quantity: 41_200 },
            { typeId: SYL, quantity: 5_000 },
          ],
          freeOreLines: [
            { typeId: ZEO, quantity: 41_200 },
            { typeId: SYL, quantity: 5_000 },
          ],
        }),
      ],
      [book()] // the book observed Zeolites only
    );
    expect(out.labels.get(`${ME}:2026-10-17:${SYSTEM}`)).toMatchObject({
      state: 'unattributed',
      corporationId: CORP,
    });
  });

  it('leaves ore no book observed at all as plain Unassigned, not Unattributed', () => {
    const out = overlay(
      [entry({ date: '2026-10-13' })],
      [book({ observed: [] })] // synced after the day closed, book saw nothing
    );
    expect(out.rows).toEqual([]);
    expect(out.labels.size).toBe(0);
  });

  it('leaves ore in a system no book observed Unassigned even when it observed another system that day', () => {
    const out = overlay(
      [entry({ solarSystemId: 30000142 })],
      [book()] // the book's observation is in SYSTEM
    );
    expect(out.labels.size).toBe(0);
  });

  it('does not call a share of a split entry a dispute', () => {
    const other = book({
      corporationId: 98000002,
      corpName: 'Ashfall Prospecting',
      observed: [
        {
          characterId: ME,
          recordedCorporationId: CORP,
          structureId: 2000,
          date: '2026-10-17',
          solarSystemId: SYSTEM,
          oreLines: [{ typeId: ZEO, quantity: 20_000 }],
        },
      ],
    });
    const whole = entry({
      oreLines: [{ typeId: ZEO, quantity: 63_050 }],
      freeOreLines: [{ typeId: ZEO, quantity: 63_050 }],
    });
    const out = overlay([whole], [book(), other]);
    expect(out.rows.every((r) => r.dispute === undefined)).toBe(true);
  });

  it('keeps what the member gave another Payee a visible conflict, not owed, for 14 days', () => {
    const assigned = entry({
      freeOreLines: [],
      oreLines: [{ typeId: ZEO, quantity: 43_050 }],
      allocations: [
        {
          payeeId: 'ashfall',
          taxPct: 10,
          oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          status: 'outstanding',
        },
      ],
    });
    const out = overlay([assigned], [book()]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      state: 'conflict',
      taxOwed: null,
      conflictCause: 'otherPayee',
    });
    // Closed at 18 Oct 00:00 + 30 min grace on the 17th → 14 days after 2026-10-18T00:30.
    expect(out.rows[0].resolvesAt).toBe('2026-11-01T00:30:00.000Z');
  });

  describe('two books in one system', () => {
    const SECOND = 98000002;
    const twoBooks = (ownFirst: string[] = [], ownSecond: string[] = []) => [
      book({
        ownPayeeIds: ownFirst,
        observed: [
          {
            characterId: ME,
            recordedCorporationId: CORP,
            structureId: 1000,
            date: '2026-10-17',
            solarSystemId: SYSTEM,
            oreLines: [{ typeId: ZEO, quantity: 40_000 }],
          },
        ],
      }),
      book({
        corporationId: SECOND,
        corpName: 'Ashfall Prospecting',
        ownPayeeIds: ownSecond,
        observed: [
          {
            characterId: ME,
            recordedCorporationId: SECOND,
            structureId: 2000,
            date: '2026-10-17',
            solarSystemId: SYSTEM,
            oreLines: [{ typeId: ZEO, quantity: 20_000 }],
          },
        ],
      }),
    ];
    const day = (allocations: PersonalEntry['allocations'], free: number) =>
      entry({
        oreLines: [{ typeId: ZEO, quantity: 60_000 }],
        freeOreLines: free > 0 ? [{ typeId: ZEO, quantity: free }] : [],
        allocations,
      });
    const given = (id: string, payeeId: string, quantity: number) => ({
      id,
      payeeId,
      taxPct: 10,
      oreLines: [{ typeId: ZEO, quantity }],
      status: 'outstanding' as const,
    });

    it("flags no overlap when the day is split to each corporation's own Payee", () => {
      const out = overlay(
        [day([given('a', 'first', 40_000), given('b', 'second', 20_000)], 0)],
        twoBooks(['first'], ['second'])
      );
      expect(out.rows.map((r) => r.state)).toEqual(['billed', 'billed']);
      expect(out.rows.every((r) => r.overlap === undefined)).toBe(true);
    });

    it("leaves the Payee for the next book to name when the first book's line is dismissed", () => {
      const [first, second] = twoBooks();
      const dismissed = {
        ...first!,
        dismissals: [
          {
            id: 'd1',
            scope: 'record' as const,
            targetId: `${ME}:1000:2026-10-17`,
            by: 1,
            at: '2026-10-18T09:00:00Z',
            reason: 'Fleet op',
          },
        ],
      };
      // 40,000 to another Payee, 20,000 free: the dismissed book contests 20,000 of the Payee's
      // ore but bills none of it, so its share stays the Payee's and the next book still names it.
      const out = overlay([day([given('x', 'ashfall', 40_000)], 20_000)], [dismissed, second!]);
      expect(out.rows.filter((r) => r.corporationId === CORP).map((r) => r.state)).toEqual([
        'dismissed',
      ]);
      const conflict = out.rows.find((r) => r.state === 'conflict');
      expect(conflict?.corporationId).toBe(98000002);
      expect(conflict?.overlap).toMatchObject({
        payeeIds: ['ashfall'],
        ore: [{ typeId: ZEO, quantity: 20_000 }],
      });
    });

    it("combines both books' overlaps into what one take-over removes from the entry", () => {
      const out = overlay([day([given('x', 'ashfall', 30_000)], 30_000)], twoBooks());
      const combined = combineOverlaps(out.rows.map((r) => r.overlap));
      expect(combined).toEqual({
        payeeIds: ['ashfall'],
        ore: [{ typeId: ZEO, quantity: 30_000 }],
        paid: false,
      });
      expect(combineOverlaps([undefined])).toBeUndefined();
    });

    it("names the Payee on each book's conflict, each capped at the ore it contests", () => {
      // 30,000 to another Payee, 30,000 free: the first book takes 30,000 free and contests
      // 10,000; the second contests all 20,000 of its own.
      const out = overlay([day([given('x', 'ashfall', 30_000)], 30_000)], twoBooks());
      const conflicts = out.rows.filter((r) => r.state === 'conflict');
      expect(conflicts.map((r) => [r.corporationId, r.oreLines[0].quantity])).toEqual([
        [CORP, 10_000],
        [SECOND, 20_000],
      ]);
      expect(conflicts.map((r) => r.overlap?.ore[0].quantity)).toEqual([10_000, 20_000]);
      expect(conflicts.every((r) => r.overlap?.payeeIds[0] === 'ashfall')).toBe(true);
      expect(out.rows.find((r) => r.state === 'billed')?.overlap).toBeUndefined();
    });
  });

  describe('an Assignment a Default System made', () => {
    const made = (over: Partial<PersonalEntry['allocations'][number]> = {}) =>
      entry({
        freeOreLines: [],
        oreLines: [{ typeId: ZEO, quantity: 43_050 }],
        allocations: [
          {
            id: 'a-default',
            payeeId: 'landlord',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 43_050 }],
            status: 'outstanding',
            releasable: true,
            ...over,
          },
        ],
      });
    const KEY = `${ME}:2026-10-17:${SYSTEM}`;

    it('is given to no Payee: the book bills the day, with no conflict', () => {
      const out = overlay([made()], [book()]);
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toMatchObject({ state: 'billed' });
      expect([...(out.absorbed.get(KEY) ?? [])]).toEqual(['a-default']);
      expect(out.takenFromFree.size).toBe(0);
    });

    it('is a conflict once the pilot has made it theirs (not releasable)', () => {
      const out = overlay([made({ releasable: undefined })], [book()]);
      expect(out.absorbed.size).toBe(0);
      expect(out.rows[0].state).toBe('conflict');
    });

    it('is left alone once it is paid', () => {
      const out = overlay([made({ status: 'paid' })], [book()]);
      expect(out.absorbed.size).toBe(0);
    });
  });

  describe('a Payee that is the corporation', () => {
    const own = (over: Partial<PersonalEntry['allocations'][number]> = {}) =>
      entry({
        freeOreLines: [],
        oreLines: [{ typeId: ZEO, quantity: 43_050 }],
        allocations: [
          {
            id: 'a-bmw',
            payeeId: 'bmw',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 43_050 }],
            status: 'outstanding',
            ...over,
          },
        ],
      });
    const KEY = `${ME}:2026-10-17:${SYSTEM}`;

    it('is no conflict: the book bills the day and the Payee row it replaces is absorbed', () => {
      const out = overlay([own()], [book({ ownPayeeIds: ['bmw'] })]);
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toMatchObject({ state: 'billed' });
      expect(out.rows[0].taxOwed).toBeGreaterThan(0);
      expect([...(out.absorbed.get(KEY) ?? [])]).toEqual(['a-bmw']);
      // The ore was the Payee's, not free: nothing comes off the residual row.
      expect(out.takenFromFree.size).toBe(0);
    });

    it('reads what is paid off the book, never a mark of the member’s own', () => {
      const out = overlay([own({ status: 'paid' })], [book({ ownPayeeIds: ['bmw'] })]);
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toMatchObject({ state: 'billed' });
      expect(out.rows[0].taxOwed).toBeCloseTo(DAY, 4);
      expect(out.absorbed.get(KEY)?.has('a-bmw')).toBe(true);
    });

    it('takes a second allocation to the same Payee by quantity; its excess is the conflict', () => {
      const two = entry({
        freeOreLines: [],
        oreLines: [{ typeId: ZEO, quantity: 43_050 }],
        allocations: [
          {
            id: 'one',
            payeeId: 'bmw',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 40_000 }],
            status: 'outstanding',
          },
          {
            id: 'two',
            payeeId: 'bmw',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 9_000 }],
            status: 'outstanding',
          },
        ],
      });
      const out = overlay([two], [book({ ownPayeeIds: ['bmw'] })]);
      // 40,000 + 3,050 fill the book's 43,050; the other 5,950 of 'two' is over-listed.
      expect([...(out.absorbed.get(KEY) ?? [])]).toEqual(['one', 'two']);
      expect(out.rows.find((r) => r.state === 'conflict')?.oreLines).toEqual([
        { typeId: ZEO, quantity: 5_950 },
      ]);
    });

    it('does not take over an allocation that needs review', () => {
      const out = overlay([own({ status: 'needs-review' })], [book({ ownPayeeIds: ['bmw'] })]);
      expect(out.absorbed.size).toBe(0);
      expect(out.rows[0].state).toBe('conflict');
    });

    it('counts a payment once when it is also a donation in flight', () => {
      const two = entry({
        date: '2026-10-16',
        freeOreLines: [],
        oreLines: [{ typeId: ZEO, quantity: 43_050 }],
        allocations: [
          {
            id: 'a',
            payeeId: 'bmw',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 43_050 }],
            status: 'paid',
          },
        ],
      });
      const other = entry({ date: '2026-10-17' });
      const b = book({
        ownPayeeIds: ['bmw'],
        observed: [
          {
            characterId: ME,
            recordedCorporationId: CORP,
            structureId: 1000,
            date: '2026-10-16',
            solarSystemId: SYSTEM,
            oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          },
          {
            characterId: ME,
            recordedCorporationId: CORP,
            structureId: 1000,
            date: '2026-10-17',
            solarSystemId: SYSTEM,
            oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          },
        ],
        // The donation that paid the 16th, also sitting in flight.
        inFlight: [{ characterId: ME, amount: 43_050 * 148 * 0.15, at: '2026-10-17T10:00:00Z' }],
      });
      const out = overlay([two, other], [b]);
      const byDate = (d: string) => out.rows.find((r) => r.date === d)!;
      expect(byDate('2026-10-16').state).toBe('paid');
      // The 17th is not paid by the same ISK a second time.
      expect(byDate('2026-10-17').state).toBe('billed');
    });

    it('keeps a conflict for ore the Payee listed beyond what the corp observed', () => {
      const big = entry({
        freeOreLines: [],
        oreLines: [{ typeId: ZEO, quantity: 50_000 }],
        allocations: [
          {
            payeeId: 'bmw',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 50_000 }],
            status: 'outstanding',
          },
        ],
      });
      const out = overlay([big], [book({ ownPayeeIds: ['bmw'] })]);
      expect(out.rows[0].state).toBe('conflict');
      expect(out.absorbed.size).toBe(0);
    });

    it("says the conflict is the corporation's own Payee listing more than the book recorded", () => {
      const big = entry({
        freeOreLines: [],
        oreLines: [{ typeId: ZEO, quantity: 50_000 }],
        allocations: [
          {
            id: 'a-big',
            payeeId: 'bmw',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 50_000 }],
            status: 'outstanding',
          },
        ],
      });
      const out = overlay([big], [book({ ownPayeeIds: ['bmw'] })]);
      expect(out.rows.find((r) => r.state === 'conflict')).toMatchObject({
        conflictCause: 'overListed',
      });
    });

    it('is still a conflict when the book does not name it as its own', () => {
      const out = overlay([own()], [book()]);
      expect(out.rows[0].state).toBe('conflict');
      expect(out.absorbed.size).toBe(0);
    });
  });

  it('resolves a conflict to the corp after 14 days', () => {
    const assigned = entry({
      freeOreLines: [],
      oreLines: [{ typeId: ZEO, quantity: 43_050 }],
      allocations: [
        {
          payeeId: 'ashfall',
          taxPct: 10,
          oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          status: 'outstanding',
        },
      ],
    });
    const out = overlay(
      [assigned],
      [book({ lastSyncedAt: '2026-11-02T00:00:00Z' })],
      '2026-11-02T10:00:00Z'
    );
    expect(out.rows[0].state).toBe('billed');
    expect(out.rows[0].taxOwed).toBeGreaterThan(0);
  });

  it('takes the corp share from free ore first, leaving only the rest in conflict', () => {
    const mixed = entry({
      oreLines: [{ typeId: ZEO, quantity: 43_050 }],
      freeOreLines: [{ typeId: ZEO, quantity: 13_050 }],
      allocations: [
        {
          payeeId: 'ashfall',
          taxPct: 10,
          oreLines: [{ typeId: ZEO, quantity: 30_000 }],
          status: 'outstanding',
        },
      ],
    });
    const out = overlay([mixed], [book()]);
    const states = out.rows.map((r) => r.state).sort();
    expect(states).toEqual(['billed', 'conflict']);
    expect(out.rows.find((r) => r.state === 'billed')?.oreLines).toEqual([
      { typeId: ZEO, quantity: 13_050 },
    ]);
    expect(out.rows.find((r) => r.state === 'conflict')?.oreLines).toEqual([
      { typeId: ZEO, quantity: 30_000 },
    ]);
  });

  it('splits one personal entry across two books by observed quantity', () => {
    const other = book({
      corporationId: 98000002,
      corpName: 'Ashfall Prospecting',
      observed: [
        {
          characterId: ME,
          recordedCorporationId: CORP,
          structureId: 2000,
          date: '2026-10-17',
          solarSystemId: SYSTEM,
          oreLines: [{ typeId: ZEO, quantity: 20_000 }],
        },
      ],
    });
    const out = overlay(
      [
        entry({
          oreLines: [{ typeId: ZEO, quantity: 30_000 }],
          freeOreLines: [{ typeId: ZEO, quantity: 30_000 }],
        }),
      ],
      [book(), other]
    );
    // 43,050 + 20,000 observed against 30,000 mined: the personal ore is split 19,000-ish / 9,500-ish,
    // and none of it is left over.
    const taken = out.takenFromFree.get(`${ME}:2026-10-17:${SYSTEM}`);
    expect(taken?.reduce((sum, l) => sum + l.quantity, 0)).toBe(30_000);
    expect(out.rows.filter((r) => r.state === 'billed')).toHaveLength(2);
  });

  it('matches by character and day alone when the book row has no system and one entry that day', () => {
    const noSystem = book({
      observed: [
        {
          characterId: ME,
          recordedCorporationId: CORP,
          structureId: 1000,
          date: '2026-10-17',
          oreLines: [{ typeId: ZEO, quantity: 43_050 }],
        },
      ],
    });
    const out = overlay([entry()], [noSystem]);
    expect(out.takenFromFree.size).toBe(1);
    expect(out.rows[0].solarSystemId).toBe(SYSTEM);
  });

  it('names the Late notice that asked for the day, and pays it oldest first like any day', () => {
    const open = overlay([entry()], [book({ notices: [noticeOf()] })]);
    expect(open.rows[0]).toMatchObject({ state: 'billed', noticeId: 'n1' });
    expect(open.rows[0].taxOwed).toBeCloseTo(DAY, 4);
    // A notice whose days are unpaid is the member's overdue one.
    expect(open.books[0].notices).toMatchObject([{ noticeId: 'n1', code: 'MTABCDEF' }]);
    const paid = overlay(
      [entry()],
      [
        book({
          notices: [noticeOf()],
          payments: [
            {
              id: 'p1',
              minerId: `solo:${ME}`,
              characterId: ME,
              amount: DAY,
              at: '2026-10-18T10:00:00Z',
              source: 'donation',
            },
          ],
        }),
      ]
    );
    expect(paid.rows[0]).toMatchObject({ state: 'paid', taxOwed: 0, settledBy: 'credit' });
    expect(paid.books[0].notices).toEqual([]);
  });

  describe('mixed-rate days', () => {
    const observed = (structureId: number, quantity: number, sourceCorporationId?: number) => ({
      characterId: ME,
      recordedCorporationId: CORP,
      structureId,
      date: '2026-10-17',
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity }],
      ...(sourceCorporationId !== undefined ? { sourceCorporationId } : {}),
    });
    const FEEDER = 98000077;
    const rates: PersonalBook['rates'] = [
      { scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' },
      { scope: 'feeder', feederId: FEEDER, pct: 7, effectiveFrom: '2026-10-01' },
    ];
    const pricesAt100 = () => ({
      prices: new Map([[ZEO, 100]]),
      sources: new Map([[ZEO, 'saved' as const]]),
    });

    it('prices each refinery line of a day at its own rate', () => {
      const out = overlay(
        [entry({ oreLines: [], freeOreLines: [] })],
        [
          book({
            rates,
            pricesOn: pricesAt100,
            observed: [observed(1000, 1_000), observed(2000, 1_000, FEEDER)],
          }),
        ]
      );
      expect(out.rows.map((r) => r.taxPct)).toEqual([10, 7]);
      expect(out.rows[0].taxOwed).toBeCloseTo(10_000, 6);
      expect(out.rows[1].taxOwed).toBeCloseTo(7_000, 6);
    });
  });

  it('shows a corp dismissal with its reason and owes nothing', () => {
    const out = overlay(
      [entry({ date: '2026-10-17' })],
      [
        book({
          dismissals: [
            {
              id: 'd1',
              scope: 'record',
              targetId: `${ME}:1000:2026-10-17`,
              by: 1,
              at: '2026-10-18T09:00:00Z',
              reason: 'Fleet op, corp-sanctioned',
            },
          ],
        }),
      ]
    );
    expect(out.rows[0]).toMatchObject({
      state: 'dismissed',
      taxOwed: 0,
      dismissalReason: 'Fleet op, corp-sanctioned',
    });
    expect(out.takenFromFree.size).toBe(1);
  });

  describe('a dismissed day the member also gave a Payee', () => {
    const dismissedBook = (over: Partial<PersonalBook> = {}) =>
      book({
        dismissals: [
          {
            id: 'd1',
            scope: 'record',
            targetId: `${ME}:1000:2026-10-17`,
            by: 1,
            at: '2026-10-18T09:00:00Z',
            reason: 'Fleet op, corp-sanctioned',
          },
        ],
        ...over,
      });
    const given = (status: 'outstanding' | 'paid') =>
      entry({
        freeOreLines: [],
        oreLines: [{ typeId: ZEO, quantity: 43_050 }],
        allocations: [
          {
            id: 'a1',
            payeeId: 'ashfall',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 43_050 }],
            status,
          },
        ],
      });

    it('is no conflict: the corporation is owed nothing for it, so the Payee keeps the ore', () => {
      const out = overlay([given('paid')], [dismissedBook()]);
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toMatchObject({ state: 'dismissed', taxOwed: 0 });
      expect(out.rows[0].resolvesAt).toBeUndefined();
    });

    it('carries no overlap: the corporation bills none of that ore', () => {
      const out = overlay([given('outstanding')], [dismissedBook()]);
      expect(out.rows[0].overlap).toBeUndefined();
    });
  });

  it('ignores a reversed dismissal', () => {
    const out = overlay(
      [entry()],
      [
        book({
          dismissals: [
            {
              id: 'd1',
              scope: 'record',
              targetId: `${ME}:1000:2026-10-17`,
              by: 1,
              at: '2026-10-18T09:00:00Z',
              reason: 'x',
              reversed: { by: 1, at: '2026-10-18T10:00:00Z' },
            },
          ],
        }),
      ]
    );
    expect(out.rows[0].state).toBe('billed');
  });

  it('uses the dated rate for the day, never a later one', () => {
    const out = overlay(
      [entry()],
      [
        book({
          rates: [
            { scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' },
            { scope: 'corp', pct: 20, effectiveFrom: '2026-10-18' },
          ],
        }),
      ]
    );
    expect(out.rows[0].taxPct).toBe(10);
  });

  it('shows no row for a day the book has no rate for yet', () => {
    const out = overlay([entry()], [book({ rates: [] })]);
    expect(out.rows).toEqual([]);
    expect(out.labels.get(`${ME}:2026-10-17:${SYSTEM}`)?.state).toBe('pending');
  });

  it('marks the oldest Billed days Paid, owing nothing, once the member sent a donation for them', () => {
    const observed = ['2026-10-15', '2026-10-16', '2026-10-17'].map((date) => ({
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date,
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 10_000 }],
    }));
    const entries = ['2026-10-15', '2026-10-16', '2026-10-17'].map((date) =>
      entry({ date, oreLines: [{ typeId: ZEO, quantity: 10_000 }] })
    );
    // 10,000 × 148 × 15% = 222,000 a day.
    const out = overlay(entries, [
      book({
        observed,
        inFlight: [{ characterId: ME, amount: 222_000, at: '2026-10-18T13:10:00Z' }],
      }),
    ]);
    const byDate = Object.fromEntries(out.rows.map((r) => [r.date, [r.state, r.taxOwed]]));
    expect(byDate).toEqual({
      '2026-10-15': ['paid', 0],
      '2026-10-16': ['billed', 222_000],
      '2026-10-17': ['billed', 222_000],
    });
  });

  it('names the donation in flight that paid a day, and the amount it paid', () => {
    const donation = {
      characterId: ME,
      amount: 1_000_000,
      at: '2026-10-18T13:10:00Z',
      refId: 5150,
    };
    const out = overlay([entry()], [book({ inFlight: [donation] })]);
    const taxOwed = 43_050 * 148 * 0.15;
    expect(out.rows[0].paidBy).toEqual({
      payments: [],
      inFlight: [{ amount: taxOwed, at: '2026-10-18T13:10:00Z', refId: 5150 }],
    });
  });

  it('names the book payments that paid each day, one slice per day', () => {
    const observed = ['2026-10-15', '2026-10-16'].map((date) => ({
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date,
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 10_000 }],
    }));
    const entries = ['2026-10-15', '2026-10-16'].map((date) =>
      entry({ date, oreLines: [{ typeId: ZEO, quantity: 10_000 }] })
    );
    const payment = (id: string, amount: number, at: string) => ({
      id,
      minerId: `solo:${ME}`,
      characterId: ME,
      amount,
      at,
      source: 'donation' as const,
    });
    const out = overlay(entries, [
      book({
        observed,
        payments: [
          payment('p1', 300_000, '2026-10-18T10:00:00Z'),
          payment('p2', 144_000, '2026-10-18T11:00:00Z'),
        ],
      }),
    ]);
    const paidBy = Object.fromEntries(out.rows.map((r) => [r.date, r.paidBy]));
    // A day is 222,000: p1 pays the first and 78,000 of the second, p2 the rest of the second.
    expect(paidBy['2026-10-15']).toEqual({
      payments: [{ paymentId: 'p1', amount: 222_000 }],
      inFlight: [],
    });
    expect(paidBy['2026-10-16']).toEqual({
      payments: [
        { paymentId: 'p1', amount: 78_000 },
        { paymentId: 'p2', amount: 144_000 },
      ],
      inFlight: [],
    });
  });

  it('puts nothing on a day that is still billed', () => {
    const out = overlay([entry()], [book()]);
    expect(out.rows[0].paidBy).toBeUndefined();
  });

  it('records a donation as how the day was settled', () => {
    const out = overlay(
      [entry()],
      [book({ inFlight: [{ characterId: ME, amount: 1_000_000, at: '2026-10-18T13:10:00Z' }] })]
    );
    expect(out.rows[0]).toMatchObject({ state: 'paid', settledBy: 'donation' });
  });

  it('keeps a day Paid once the book credits the donation', () => {
    const observed = ['2026-10-15', '2026-10-16'].map((date) => ({
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date,
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 10_000 }],
    }));
    const entries = ['2026-10-15', '2026-10-16'].map((date) =>
      entry({ date, oreLines: [{ typeId: ZEO, quantity: 10_000 }] })
    );
    const held = {
      id: 'p1',
      minerId: `solo:${ME}`,
      characterId: ME,
      amount: 222_000,
      at: '2026-10-18T13:10:00Z',
      source: 'donation' as const,
    };
    const out = overlay(entries, [book({ observed, payments: [held] })]);
    const byDate = Object.fromEntries(out.rows.map((r) => [r.date, [r.state, r.taxOwed]]));
    expect(byDate).toEqual({
      '2026-10-15': ['paid', 0],
      '2026-10-16': ['billed', 222_000],
    });
    // Every ISK of it paid the oldest day: none is left as credit.
    expect(out.books[0].credit).toBe(0);
    // Money the book already holds is a credit, not a donation the member just sent.
    expect(out.rows.find((r) => r.date === '2026-10-15')?.settledBy).toBe('credit');
  });

  it('reads a day the book closed in its checkpoint as paid, and pays the next from its credit', () => {
    const observed = ['2026-10-15', '2026-10-16'].map((date) => ({
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date,
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 10_000 }],
    }));
    const entries = ['2026-10-15', '2026-10-16'].map((date) =>
      entry({ date, oreLines: [{ typeId: ZEO, quantity: 10_000 }] })
    );
    const checkpoint = {
      minerId: `solo:${ME}`,
      through: '2026-10-15',
      owed: [],
      credit: 100_000,
      balance: -100_000,
      paidThrough: '2026-10-15',
      at: '2026-11-20T00:00:00Z',
    };
    const out = overlay(entries, [
      book({ observed, checkpoints: new Map([[checkpoint.minerId, checkpoint]]) }),
    ]);
    const byDate = Object.fromEntries(out.rows.map((r) => [r.date, [r.state, r.taxOwed]]));
    expect(byDate).toEqual({
      '2026-10-15': ['paid', 0],
      '2026-10-16': ['billed', 122_000],
    });
    expect(out.rows.find((r) => r.date === '2026-10-15')?.settledBy).toBe('closed');
  });

  describe('on a running account', () => {
    const observed = ['2026-10-15', '2026-10-16'].map((date) => ({
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date,
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 10_000 }],
    }));
    const entries = ['2026-10-15', '2026-10-16'].map((date) =>
      entry({ date, oreLines: [{ typeId: ZEO, quantity: 10_000 }] })
    );
    const paid = (amount: number) => ({
      id: 'p1',
      minerId: `solo:${ME}`,
      characterId: ME,
      amount,
      at: '2026-10-18T13:10:00Z',
      source: 'donation' as const,
    });
    const running = (amount: number) =>
      overlay(entries, [book({ observed, payments: [paid(amount)] })]).books[0];

    describe('with an officer correction, as the corp book counts it', () => {
      // Each day is 10,000 × 148 × 15% = 222,000.
      const adjust = (id: string, date: string, amount: number) => ({
        id,
        minerId: `solo:${ME}`,
        date,
        amount,
        reason: 'Rolled over',
        by: 1,
        at: '2026-10-18T13:00:00Z',
      });
      const withAdjustments = (...adjustments: ReturnType<typeof adjust>[]) =>
        overlay(entries, [book({ observed, adjustments })]).books[0];

      it('explains a part-paid day, a forgiven shortfall and a reversed correction on its row', () => {
        const rowsOf = (payments: ReturnType<typeof withPayments>, adjustments = [] as never[]) =>
          overlay(entries, [
            book({
              observed,
              payments,
              adjustments,
            }),
          ]).rows;
        const pay = (amount: number) => ({
          id: 'p1',
          minerId: `solo:${ME}`,
          characterId: ME,
          amount,
          at: '2026-10-18T13:10:00Z',
          source: 'donation' as const,
        });
        const withPayments = (amount: number) => [pay(amount)];
        // 100,000 of the oldest 222,000 day: part paid.
        const part = rowsOf(withPayments(100_000)).find((r) => r.date === '2026-10-15')!;
        expect(part).toMatchObject({ paidIsk: 100_000, taxOwed: 122_000, billed: 222_000 });
        // 221,500 pays it within tolerance: 500 forgiven.
        const closed = rowsOf(withPayments(221_500)).find((r) => r.date === '2026-10-15')!;
        expect(closed).toMatchObject({ state: 'paid', forgivenIsk: 500 });
        // A reversed correction changes nothing and stays on the day.
        const reversed = adjust('a', '2026-10-15', 300_000);
        const day = rowsOf(
          [],
          [
            {
              ...reversed,
              reversed: { by: 2, at: '2026-10-18T13:20:00Z', reason: 'Twice' },
            } as never,
          ]
        ).find((r) => r.date === '2026-10-15')!;
        expect(day.taxOwed).toBe(222_000);
        expect(day.reversedCorrections).toEqual([
          { amount: 300_000, reason: 'Rolled over', reversedReason: 'Twice' },
        ]);
      });

      it('owes a charge dated on a day the member did not mine', () => {
        // As the book counts it: the correction is a day of its own on the account.
        expect(withAdjustments(adjust('a', '2026-10-05', 1_000_000))).toMatchObject({
          credit: 0,
          account: { owes: { amount: 1_444_000, days: 3, oldest: '2026-10-05' } },
        });
      });

      it('pays the oldest days with a credit dated on a day the member did not mine, then keeps the rest', () => {
        expect(withAdjustments(adjust('a', '2026-10-05', -500_000))).toMatchObject({
          credit: 56_000,
          account: { owes: null },
        });
      });

      it('carries a credit bigger than its own day on to the next days instead of dropping it', () => {
        expect(withAdjustments(adjust('a', '2026-10-15', -1_000_000))).toMatchObject({
          credit: 556_000,
          account: { owes: null },
        });
      });
    });

    it('shows no credit for money that paid a day, and says what is still owed', () => {
      expect(running(222_000)).toMatchObject({
        credit: 0,
        account: {
          paidThrough: '2026-10-15',
          owes: { amount: 222_000, days: 1, oldest: '2026-10-16' },
        },
      });
    });

    it('pays a day a late notice listed like any running day, and lists the notice while it is unpaid', () => {
      const line = (date: string) => ({
        kind: 'mined' as const,
        date,
        key: `${ME}:1000:${date}`,
        oreLines: [{ typeId: ZEO, quantity: 10_000 }],
        estimatedValue: 0,
        // Priced differently from the day itself: the day's own figure is what is owed.
        tax: 999_999,
      });
      const notice = noticeOf({
        id: 'notice_2026-10-15',
        issuedAt: '2026-10-17T00:00:00Z',
        code: 'NTX-ABCD',
        lines: [line('2026-10-15'), line('2026-10-16')],
      });
      const out = overlay(entries, [
        book({ observed, notices: [notice], payments: [paid(222_000)] }),
      ]).books[0];
      expect(out).toMatchObject({
        credit: 0,
        notices: [{ noticeId: notice.id, code: 'NTX-ABCD', remaining: 222_000 }],
        account: { paidThrough: '2026-10-15', owes: { amount: 222_000, days: 1 } },
      });
    });

    it('holds only a true overpayment as credit, and reads paid through the last day', () => {
      expect(running(500_000)).toMatchObject({
        credit: 56_000,
        account: { paidThrough: '2026-10-16', owes: null },
      });
    });
  });

  it('reports the sync note facts: last synced, closed through, credit', () => {
    const out = overlay([entry()], [book()]);
    expect(out.books[0]).toMatchObject({
      corporationId: CORP,
      lastSyncedAt: SYNCED,
      closedThrough: '2026-10-17',
    });
  });
});

describe('overlayCorpBooks: the miner side of a refinery book', () => {
  const refinery = (structureId: number, quantity: number, sourceCorporationId?: number) => ({
    characterId: ME,
    recordedCorporationId: CORP,
    structureId,
    date: '2026-10-17',
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ZEO, quantity }],
    ...(sourceCorporationId !== undefined ? { sourceCorporationId } : {}),
  });

  it('matches one personal entry against the SUM of two refineries in the system', () => {
    const out = overlay(
      [
        entry({
          oreLines: [{ typeId: ZEO, quantity: 30_000 }],
          freeOreLines: [{ typeId: ZEO, quantity: 30_000 }],
        }),
      ],
      [book({ observed: [refinery(1000, 10_000), refinery(2000, 20_000)] })]
    );
    expect(out.rows).toHaveLength(2);
    expect(out.rows.map((r) => r.structureId).sort()).toEqual([1000, 2000]);
    expect(out.rows.every((r) => r.dispute === undefined)).toBe(true);
  });

  it('bills nothing for a moon owner row outside its coverage (#4618)', () => {
    const OWNER = 98000077;
    const out = overlay(
      [entry({ oreLines: [{ typeId: ZEO, quantity: 30_000 }] })],
      [
        book({
          observed: [refinery(1000, 10_000, OWNER), refinery(2000, 20_000)],
          feeders: [{ corporationId: OWNER, coveragePeriods: [{ from: '2026-10-18' }] }],
        }),
      ]
    );
    expect(out.rows.map((r) => r.structureId)).toEqual([2000]);
  });

  it('prices each refinery line at its own per-feeder rate', () => {
    const out = overlay(
      [entry({ oreLines: [{ typeId: ZEO, quantity: 30_000 }] })],
      [
        book({
          observed: [refinery(1000, 10_000, 98000077), refinery(2000, 20_000)],
          rates: [
            { scope: 'corp', pct: 15, effectiveFrom: '2026-10-01' },
            { scope: 'feeder', feederId: 98000077, pct: 5, effectiveFrom: '2026-10-01' },
          ],
        }),
      ]
    );
    const byStructure = new Map(out.rows.map((r) => [r.structureId, r.taxPct]));
    expect(byStructure.get(1000)).toBe(5);
    expect(byStructure.get(2000)).toBe(15);
  });

  it('flags no overlap when the miner gave the ore to nobody', () => {
    const out = overlay([entry()], [book()]);
    expect(out.rows[0].overlap).toBeUndefined();
  });

  it('flags each refinery line of the day with its own share of the overlap', () => {
    const assigned = entry({
      freeOreLines: [],
      oreLines: [{ typeId: ZEO, quantity: 30_000 }],
      allocations: [
        {
          payeeId: 'ashfall',
          taxPct: 10,
          oreLines: [{ typeId: ZEO, quantity: 30_000 }],
          status: 'outstanding',
        },
      ],
    });
    const out = overlay(
      [assigned],
      [book({ observed: [refinery(1000, 10_000), refinery(2000, 20_000)] })]
    );
    const byStructure = new Map(out.rows.map((r) => [r.structureId, r.overlap]));
    expect(byStructure.get(1000)).toEqual({
      payeeIds: ['ashfall'],
      ore: [{ typeId: ZEO, quantity: 10_000 }],
      paid: false,
    });
    expect(byStructure.get(2000)).toEqual({
      payeeIds: ['ashfall'],
      ore: [{ typeId: ZEO, quantity: 20_000 }],
      paid: false,
    });
  });

  it('caps the overlap at what the corporation observed', () => {
    const assigned = entry({
      freeOreLines: [],
      oreLines: [{ typeId: ZEO, quantity: 50_000 }],
      allocations: [
        {
          payeeId: 'ashfall',
          taxPct: 15,
          oreLines: [{ typeId: ZEO, quantity: 50_000 }],
          status: 'outstanding',
        },
      ],
    });
    const out = overlay([assigned], [book()]);
    expect(out.rows[0].overlap?.ore).toEqual([{ typeId: ZEO, quantity: 43_050 }]);
  });

  it('marks an overlap paid when the miner marked the entry paid', () => {
    const assigned = entry({
      freeOreLines: [],
      oreLines: [{ typeId: ZEO, quantity: 43_050 }],
      allocations: [
        {
          payeeId: 'ashfall',
          taxPct: 15,
          oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          status: 'paid',
        },
      ],
    });
    const out = overlay([assigned], [book()]);
    expect(out.rows.find((r) => r.overlap)?.overlap).toMatchObject({ paid: true });
  });

  it('shows no overlap before the day is Billable', () => {
    const assigned = entry({
      freeOreLines: [],
      allocations: [
        {
          payeeId: 'ashfall',
          taxPct: 15,
          oreLines: [{ typeId: ZEO, quantity: 41_200 }],
          status: 'outstanding',
        },
      ],
    });
    const out = overlay([assigned], [book({ lastSyncedAt: undefined })]);
    expect(out.rows).toEqual([]);
  });

  it('shows no correction on a line billed once', () => {
    expect(overlay([entry()], [book()]).rows[0].correction).toBeUndefined();
  });
});

describe('previewTakeover', () => {
  it('removes only the overlapping ore from the miner entry and shows before and after', () => {
    const preview = previewTakeover(
      [
        {
          payeeId: 'ashfall',
          taxPct: 10,
          oreLines: [
            { typeId: ZEO, quantity: 50_000 },
            { typeId: SYL, quantity: 5_000 },
          ],
          status: 'outstanding',
        },
      ],
      [{ typeId: ZEO, quantity: 43_050 }]
    );
    expect(preview).toEqual([
      {
        index: 0,
        payeeId: 'ashfall',
        before: [
          { typeId: ZEO, quantity: 50_000 },
          { typeId: SYL, quantity: 5_000 },
        ],
        after: [
          { typeId: ZEO, quantity: 6_950 },
          { typeId: SYL, quantity: 5_000 },
        ],
      },
    ]);
  });

  it('empties an allocation the corporation bills in full', () => {
    const preview = previewTakeover(
      [
        {
          payeeId: 'ashfall',
          taxPct: 10,
          oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          status: 'outstanding',
        },
      ],
      [{ typeId: ZEO, quantity: 43_050 }]
    );
    expect(preview[0].after).toEqual([]);
  });

  it('spreads the overlap across allocations in order', () => {
    const preview = previewTakeover(
      [
        {
          payeeId: 'a',
          taxPct: 10,
          oreLines: [{ typeId: ZEO, quantity: 10 }],
          status: 'outstanding',
        },
        {
          payeeId: 'b',
          taxPct: 10,
          oreLines: [{ typeId: ZEO, quantity: 10 }],
          status: 'outstanding',
        },
      ],
      [{ typeId: ZEO, quantity: 15 }]
    );
    expect(preview.map((p) => p.after)).toEqual([[], [{ typeId: ZEO, quantity: 5 }]]);
  });
});

describe('inFlightDonations', () => {
  const made = (over = {}) => ({
    characterId: ME,
    counterpartyId: CORP,
    amount: 500_000,
    date: '2026-10-18T13:10:00Z',
    method: 'donation' as const,
    ...over,
  });

  // The one number an officer can search the corporation's own journal on; without it they
  // are left matching by amount and minute.
  it('carries the wallet journal reference when the donation has one', () => {
    expect(inFlightDonations([made({ refId: 7788991 })], [], CORP, '2026-10-01')).toEqual([
      { characterId: ME, amount: 500_000, at: '2026-10-18T13:10:00Z', refId: 7788991 },
    ]);
  });

  it('omits the reference rather than inventing one when the journal had none', () => {
    expect(inFlightDonations([made()], [], CORP, '2026-10-01')[0]).not.toHaveProperty('refId');
  });

  it('counts donations to the corp the book has not credited yet', () => {
    expect(inFlightDonations([made()], [], CORP, '2026-10-01')).toEqual([
      { characterId: ME, amount: 500_000, at: '2026-10-18T13:10:00Z' },
    ]);
  });

  it('skips a donation the book already holds, within a few minutes', () => {
    const held = [
      { characterId: ME, amount: 500_000, at: '2026-10-18T13:12:00Z', notTaxAmount: 0 },
    ];
    expect(inFlightDonations([made()], held, CORP, '2026-10-01')).toEqual([]);
  });

  // Audit bug 5: one held 10M swallowed both of two 10M donations, hiding the second.
  it('pairs one held payment with one donation only', () => {
    const held = [{ characterId: ME, amount: 500_000, at: '2026-10-18T13:11:00Z' }];
    const two = [made({ refId: 1 }), made({ refId: 2, date: '2026-10-18T13:14:00Z' })];
    expect(inFlightDonations(two, held, CORP, '2026-10-01').map((d) => d.refId)).toEqual([2]);
  });

  // Audit bug 6: an officer's hand record is dated by them (noon), never the journal's minute.
  it('pairs an officer’s hand record with the member’s donation within two days', () => {
    const held = [
      { characterId: ME, amount: 500_000, at: '2026-10-19T12:00:00Z', source: 'manual' as const },
    ];
    expect(inFlightDonations([made()], held, CORP, '2026-10-01')).toEqual([]);
    // A donation the book holds is never matched with the same minute rule a day later.
    expect(
      inFlightDonations(
        [made()],
        [{ characterId: ME, amount: 500_000, at: '2026-10-19T12:00:00Z' }],
        CORP,
        '2026-10-01'
      )
    ).toHaveLength(1);
  });

  it('skips other recipients, contracts and donations before the book started', () => {
    expect(
      inFlightDonations(
        [
          made({ counterpartyId: 1 }),
          made({ method: 'contract' }),
          made({ date: '2026-09-30T10:00:00Z' }),
        ],
        [],
        CORP,
        '2026-10-01'
      )
    ).toEqual([]);
  });
});

describe('overlayCorpBooks: a moon owner read clock (#4622)', () => {
  const OWNER = 98000077;
  const owned = (date = '2026-10-17') => ({
    characterId: ME,
    recordedCorporationId: CORP,
    structureId: 3000,
    date,
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ZEO, quantity: 20_000 }],
    sourceCorporationId: OWNER,
  });

  it('holds back a day the moon owner ledger was not read well after', () => {
    const out = overlay(
      [entry()],
      [
        book({
          observed: [owned()],
          // Last good read before the day closed: the day is not Billable yet.
          feeders: [{ corporationId: OWNER, lastReadWellAt: '2026-10-17T20:00:00Z' }],
        }),
      ]
    );
    expect(out.rows).toEqual([]);
    // The miner's own ore still reads as waiting on the corporation, not plain Unassigned.
    expect(out.labels.get(`${ME}:2026-10-17:${SYSTEM}`)?.state).toBe('pending');
  });

  it('holds the whole miner day, the book refinery included', () => {
    const own = { ...owned(), structureId: 1000, sourceCorporationId: undefined };
    const out = overlay(
      [entry()],
      [book({ observed: [owned(), own], feeders: [{ corporationId: OWNER }] })]
    );
    expect(out.rows).toEqual([]);
  });

  it('bills the day once the moon owner ledger was read well after it closed', () => {
    const out = overlay(
      [entry()],
      [
        book({
          observed: [owned()],
          feeders: [{ corporationId: OWNER, lastReadWellAt: '2026-10-18T07:00:00Z' }],
        }),
      ]
    );
    expect(out.rows.map((r) => r.state)).toEqual(['billed']);
  });

  it('bills as before when the read clock is not known to the reader', () => {
    const out = overlay([entry()], [book({ observed: [owned()] })]);
    expect(out.rows).toHaveLength(1);
  });
});

describe('overlayCorpBooks: corrections by the corporation (#4622)', () => {
  const MINER = `solo:${ME}`;
  it('shows an adjustment as before and after, with the reason', () => {
    const adjustment = {
      id: 'a1',
      minerId: MINER,
      date: '2026-10-17',
      amount: -100_000,
      reason: 'Wrong hub price',
      by: 1,
      at: '2026-10-18T00:00:00Z',
    };
    const row = overlay([entry()], [book({ adjustments: [adjustment] })]).rows[0];
    expect(row.correction?.before).toBeCloseTo(DAY, 4);
    expect(row.correction?.after).toBeCloseTo(DAY - 100_000, 4);
    expect(row.correction?.reasons).toEqual(['Wrong hub price']);
    expect(row.taxOwed).toBeCloseTo(DAY - 100_000, 4);
  });

  it('reads an adjustment the book recorded', () => {
    const row = overlay(
      [entry()],
      [
        book({
          adjustments: [
            {
              id: 'a2',
              minerId: MINER,
              date: '2026-10-17',
              amount: 50_000,
              reason: 'Missed ore',
              by: 1,
              at: '2026-10-18T13:00:00Z',
            },
          ],
        }),
      ]
    ).rows[0];
    const before = 43_050 * 148 * 0.15;
    expect(row.correction?.before).toBeCloseTo(before, 4);
    expect(row.correction?.after).toBeCloseTo(before + 50_000, 4);
    expect(row.correction?.reasons).toEqual(['Missed ore']);
  });

  const forgive = (amount: number, extra: Record<string, never> = {}) => ({
    id: 'w1',
    minerId: MINER,
    amount,
    reason: 'Goodwill',
    at: '2026-10-20T00:00:00Z',
    ...extra,
  });

  it('names the payments that paid a day', () => {
    const payment = (id: string, amount: number, at: string) => ({
      id,
      minerId: MINER,
      characterId: ME,
      amount,
      at,
      source: 'donation' as const,
    });
    const row = overlay(
      [entry()],
      [
        book({
          payments: [
            payment('p1', 500_000, '2026-10-21T00:00:00Z'),
            payment('p2', 400_000, '2026-10-22T00:00:00Z'),
          ],
        }),
      ]
    ).rows[0];
    expect(row.paidBy).toEqual({
      payments: [
        { paymentId: 'p1', amount: 500_000 },
        { paymentId: 'p2', amount: 400_000 },
      ],
      inFlight: [],
    });
  });

  it("ignores another Miner's write-off (#4637)", () => {
    const row = overlay(
      [entry()],
      [
        book({
          writeOffs: [{ ...forgive(900_000), minerId: 'solo:1' }],
        }),
      ]
    ).rows[0];
    expect(row.state).toBe('billed');
    expect(row.correction).toBeUndefined();
  });

  const pay = (id: string, amount: number) => ({
    id,
    minerId: MINER,
    characterId: ME,
    amount,
    at: '2026-10-19T10:00:00Z',
    source: 'donation' as const,
  });
  const raise = {
    id: 'a3',
    minerId: MINER,
    date: '2026-10-17',
    amount: 200_000,
    reason: 'Missed ore',
    by: 1,
    at: '2026-10-19T00:00:00Z',
  };

  it('marks the day paid once its raise is paid too', () => {
    const owes = overlay([entry()], [book({ adjustments: [raise], payments: [pay('p1', DAY)] })])
      .rows[0];
    expect(owes).toMatchObject({ state: 'billed' });
    expect(owes.taxOwed).toBeCloseTo(200_000, 4);
    const row = overlay(
      [entry()],
      [book({ adjustments: [raise], payments: [pay('p1', DAY + 200_000)] })]
    ).rows[0];
    expect(row).toMatchObject({ state: 'paid', taxOwed: 0 });
  });

  it("ignores another miner's corrections", () => {
    const row = overlay(
      [entry()],
      [
        book({
          adjustments: [
            {
              id: 'a9',
              minerId: 'solo:1',
              date: '2026-10-17',
              amount: 1,
              reason: 'x',
              by: 1,
              at: '2026-10-18T00:00:00Z',
            },
          ],
        }),
      ]
    ).rows[0];
    expect(row.correction).toBeUndefined();
  });
});

describe('overlayCorpBooks: a book takes the miner own Assignments by quantity (#6203)', () => {
  const SECOND = 98000002;
  const OWNER = 98000077;
  const KEY = `${ME}:2026-10-17:${SYSTEM}`;
  const observedBy = (corporationId: number, quantity: number, sourceCorporationId?: number) => ({
    characterId: ME,
    recordedCorporationId: corporationId,
    structureId: corporationId === CORP ? 1000 : 2000,
    date: '2026-10-17',
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ZEO, quantity }],
    ...(sourceCorporationId !== undefined ? { sourceCorporationId } : {}),
  });
  const twoMoons = (ownFirst: string[] = []) => [
    book({ ownPayeeIds: ownFirst, observed: [observedBy(CORP, 40_000)] }),
    book({
      corporationId: SECOND,
      corpName: 'Ashfall Prospecting',
      observed: [observedBy(SECOND, 20_000)],
    }),
  ];
  const alloc = (
    over: Partial<PersonalEntry['allocations'][number]>
  ): PersonalEntry['allocations'][number] => ({
    id: 'a',
    payeeId: 'landlord',
    taxPct: 10,
    oreLines: [{ typeId: ZEO, quantity: 60_000 }],
    status: 'outstanding',
    ...over,
  });
  const allGiven = (quantity: number, allocations: PersonalEntry['allocations']) =>
    entry({ oreLines: [{ typeId: ZEO, quantity }], freeOreLines: [], allocations });

  describe("a Default System's unpaid Assignment", () => {
    it('is split between two books by quantity, never a Conflict', () => {
      const out = overlay(
        [allGiven(60_000, [alloc({ id: 'a-default', releasable: true })])],
        twoMoons()
      );
      expect(out.rows.map((r) => [r.corporationId, r.state, r.oreLines[0].quantity])).toEqual([
        [CORP, 'billed', 40_000],
        [SECOND, 'billed', 20_000],
      ]);
      expect([...(out.absorbed.get(KEY) ?? [])]).toEqual(['a-default']);
      expect(out.trimmed.size).toBe(0);
    });

    it('keeps what no book took with its default Payee', () => {
      const out = overlay(
        [
          allGiven(50_000, [
            alloc({
              id: 'a-default',
              releasable: true,
              oreLines: [
                { typeId: ZEO, quantity: 43_050 + 6_950 },
                { typeId: SYL, quantity: 1_000 },
              ],
            }),
          ]),
        ],
        [book()]
      );
      expect(out.rows.map((r) => r.state)).toEqual(['billed']);
      expect(out.absorbed.size).toBe(0);
      const kept = out.trimmed.get(KEY)?.get('a-default');
      expect(kept?.oreLines).toEqual([
        { typeId: ZEO, quantity: 6_950 },
        { typeId: SYL, quantity: 1_000 },
      ]);
      // The kept part's worth, at the book's prices, of the whole Assignment's.
      const whole = 50_000 * 148 + 1_000 * 100;
      expect(kept?.valueShare).toBeCloseTo((6_950 * 148 + 1_000 * 100) / whole, 6);
    });
  });

  describe("an Assignment to the corporation's own Payee", () => {
    it('is absorbed up to the share; only the excess is an over-listed Conflict', () => {
      const out = overlay(
        [
          allGiven(50_000, [
            alloc({ id: 'a-bmw', payeeId: 'bmw', oreLines: [{ typeId: ZEO, quantity: 50_000 }] }),
          ]),
        ],
        [book({ ownPayeeIds: ['bmw'] })]
      );
      const billed = out.rows.find((r) => r.state === 'billed');
      expect(billed?.oreLines).toEqual([{ typeId: ZEO, quantity: 43_050 }]);
      expect(billed?.taxOwed).toBeCloseTo(43_050 * 148 * 0.15, 4);
      const conflicts = out.rows.filter((r) => r.state === 'conflict');
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        conflictCause: 'overListed',
        oreLines: [{ typeId: ZEO, quantity: 6_950 }],
        taxOwed: null,
        // The book never recorded it, so nothing bills it and it never resolves to the corp.
        billed: 0,
        overlap: { payeeIds: ['bmw'], ore: [{ typeId: ZEO, quantity: 6_950 }], paid: false },
      });
      expect(conflicts[0].resolvesAt).toBeUndefined();
      // Both rows stand in for the Assignment.
      expect([...(out.absorbed.get(KEY) ?? [])]).toEqual(['a-bmw']);
    });

    it("leaves what another book contests on the Assignment, not as this book's excess", () => {
      const out = overlay(
        [allGiven(60_000, [alloc({ id: 'a-bmw', payeeId: 'bmw' })])],
        twoMoons(['bmw'])
      );
      expect(out.rows.map((r) => [r.corporationId, r.state, r.conflictCause])).toEqual([
        [CORP, 'billed', undefined],
        [SECOND, 'conflict', 'otherPayee'],
      ]);
      expect(out.trimmed.get(KEY)?.get('a-bmw')?.oreLines).toEqual([
        { typeId: ZEO, quantity: 20_000 },
      ]);
    });

    it('names an own entry that needs review as such, not another Payee', () => {
      const out = overlay(
        [
          allGiven(43_050, [
            alloc({
              payeeId: 'bmw',
              status: 'needs-review',
              oreLines: [{ typeId: ZEO, quantity: 43_050 }],
            }),
          ]),
        ],
        [book({ ownPayeeIds: ['bmw'] })]
      );
      expect(out.rows[0]).toMatchObject({ state: 'conflict', conflictCause: 'ownNeedsReview' });
    });
  });

  it('lets a later book take its own Assignment before an earlier book names Payees', () => {
    const books = [
      book({ observed: [observedBy(CORP, 40_000)] }),
      book({
        corporationId: SECOND,
        corpName: 'Ashfall Prospecting',
        ownPayeeIds: ['ash'],
        observed: [observedBy(SECOND, 20_000)],
      }),
    ];
    const out = overlay(
      [
        allGiven(60_000, [
          alloc({ id: 'a-ash', payeeId: 'ash', oreLines: [{ typeId: ZEO, quantity: 20_000 }] }),
          alloc({ id: 'a-other', payeeId: 'other', oreLines: [{ typeId: ZEO, quantity: 40_000 }] }),
        ]),
      ],
      books
    );
    expect(out.rows.map((r) => [r.corporationId, r.state, r.overlap?.payeeIds])).toEqual([
      [CORP, 'conflict', ['other']],
      [SECOND, 'billed', undefined],
    ]);
    expect([...(out.absorbed.get(KEY) ?? [])]).toEqual(['a-ash']);
  });

  it('names an own entry needing review whatever order the entries are in', () => {
    const out = overlay(
      [
        allGiven(53_050, [
          alloc({ payeeId: 'other', oreLines: [{ typeId: ZEO, quantity: 43_050 }] }),
          alloc({
            id: 'b',
            payeeId: 'bmw',
            status: 'needs-review',
            oreLines: [{ typeId: ZEO, quantity: 10_000 }],
          }),
        ]),
      ],
      [book({ ownPayeeIds: ['bmw'] })]
    );
    expect(out.rows[0]).toMatchObject({ state: 'conflict', conflictCause: 'ownNeedsReview' });
  });

  it("says a Collector now bills the moon when the miner's Payee is its owner", () => {
    const out = overlay(
      [
        allGiven(43_050, [
          alloc({ payeeId: 'moonco', oreLines: [{ typeId: ZEO, quantity: 43_050 }] }),
        ]),
      ],
      [
        book({
          observed: [observedBy(CORP, 43_050, OWNER)],
          feeders: [{ corporationId: OWNER, lastReadWellAt: SYNCED }],
          payeeCorporations: { moonco: OWNER, other: 1 },
        }),
      ]
    );
    expect(out.rows[0]).toMatchObject({
      state: 'conflict',
      conflictCause: 'ownerCollected',
      ownerPayeeId: 'moonco',
    });
  });

  it('is still another Payee when the Payee is not the moon owner', () => {
    const out = overlay(
      [
        allGiven(43_050, [
          alloc({ payeeId: 'other', oreLines: [{ typeId: ZEO, quantity: 43_050 }] }),
        ]),
      ],
      [
        book({
          observed: [observedBy(CORP, 43_050, OWNER)],
          feeders: [{ corporationId: OWNER, lastReadWellAt: SYNCED }],
          payeeCorporations: { moonco: OWNER, other: 1 },
        }),
      ]
    );
    expect(out.rows[0].conflictCause).toBe('otherPayee');
    expect(out.rows[0].ownerPayeeId).toBeUndefined();
  });

  it("disputes each book's quantity against its own share on a two-book day", () => {
    // 50,000 mined, the books claim 40,000 + 20,000: each share is cut to 33,333 / 16,667.
    const out = overlay(
      [
        entry({
          oreLines: [{ typeId: ZEO, quantity: 50_000 }],
          freeOreLines: [{ typeId: ZEO, quantity: 50_000 }],
        }),
      ],
      twoMoons()
    );
    expect(out.rows.map((r) => [r.dispute?.personalQuantity, r.dispute?.bookQuantity])).toEqual([
      [33_333, 40_000],
      [16_667, 20_000],
    ]);
  });

  it('does not dispute a two-book day whose shares match what each book recorded', () => {
    const out = overlay(
      [
        entry({
          oreLines: [{ typeId: ZEO, quantity: 60_000 }],
          freeOreLines: [{ typeId: ZEO, quantity: 60_000 }],
        }),
      ],
      twoMoons()
    );
    expect(out.rows.every((r) => r.dispute === undefined)).toBe(true);
  });
});

describe('overlayCorpBooks: the tab agrees with the book (#6204)', () => {
  const ALT = 90000002;
  const KEY = `${ME}:2026-10-17:${SYSTEM}`;
  const observedFor = (characterId: number, date = '2026-10-17') => ({
    characterId,
    recordedCorporationId: CORP,
    structureId: 1000,
    date,
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ZEO, quantity: 43_050 }],
  });
  describe("a Miner's credit settles only its own days", () => {
    // 43,050 × 148 × 15% = 955,710 a day; each payment is enough for one day.
    const DAY = 43_050 * 148 * 0.15;
    const twoMiners = (over: Partial<PersonalBook> = {}) =>
      book({ observed: [observedFor(ME), observedFor(ALT)], ...over });
    const both = [entry(), entry({ characterId: ALT })];
    const stateOf = (out: ReturnType<typeof overlay>, characterId: number) =>
      out.rows.find((r) => r.characterId === characterId)?.state;

    it('credit the book holds for one Miner leaves the other owing', () => {
      const out = overlay(both, [
        twoMiners({
          payments: [
            {
              id: 'p1',
              minerId: `solo:${ME}`,
              characterId: ME,
              amount: DAY,
              at: '2026-10-18T10:00:00Z',
              source: 'donation',
            },
          ],
        }),
      ]);
      expect(stateOf(out, ME)).toBe('paid');
      expect(stateOf(out, ALT)).toBe('billed');
    });

    it("a donation in flight pays only its sender's Miner", () => {
      const out = overlay(both, [
        twoMiners({ inFlight: [{ characterId: ALT, amount: DAY, at: '2026-10-18T13:10:00Z' }] }),
      ]);
      expect(stateOf(out, ME)).toBe('billed');
      expect(stateOf(out, ALT)).toBe('paid');
    });

    it("a grouped Miner's donation pays any of its characters' days", () => {
      const out = overlay(both, [
        twoMiners({
          miners: [{ id: 'g1', characterIds: [ME, ALT], mainCharacterId: ME }],
          inFlight: [{ characterId: ME, amount: 2 * DAY, at: '2026-10-18T13:10:00Z' }],
        }),
      ]);
      expect(stateOf(out, ME)).toBe('paid');
      expect(stateOf(out, ALT)).toBe('paid');
    });
  });

  describe('ore the book bills that a hand-made Payee also lists', () => {
    const toOther = (quantity: number) =>
      entry({
        freeOreLines: [],
        oreLines: [{ typeId: ZEO, quantity }],
        allocations: [
          {
            id: 'a-other',
            payeeId: 'other',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity }],
            status: 'outstanding',
          },
        ],
      });

    it('names the share of the Assignment the book bills too, once the Conflict ran its 14 days', () => {
      const out = overlay([toOther(43_050)], [book()], LATE);
      expect(out.rows[0].state).toBe('billed');
      expect(out.alsoBilled.get(KEY)?.get('a-other')).toBeCloseTo(1, 6);
    });

    it('is only the part the book recorded', () => {
      const out = overlay([toOther(50_000)], [book()], LATE);
      expect(out.alsoBilled.get(KEY)?.get('a-other')).toBeCloseTo(43_050 / 50_000, 6);
    });

    it('is nothing while the day is still a Conflict', () => {
      const out = overlay([toOther(43_050)], [book()]);
      expect(out.rows[0].state).toBe('conflict');
      expect(out.alsoBilled.size).toBe(0);
    });
  });

  describe('Late notices whose days are unpaid', () => {
    it('names an unpaid one, with its code', () => {
      const out = overlay([entry()], [book({ notices: [noticeOf()] })]);
      expect(out.books[0].notices).toMatchObject([
        { noticeId: 'n1', minerId: `solo:${ME}`, code: 'MTABCDEF' },
      ]);
    });

    it('never names a settled one', () => {
      const out = overlay(
        [entry()],
        [
          book({
            notices: [noticeOf()],
            payments: [
              {
                id: 'p1',
                minerId: `solo:${ME}`,
                characterId: ME,
                amount: DAY,
                at: '2026-10-19T10:00:00Z',
                source: 'donation',
              },
            ],
          }),
        ]
      );
      expect(out.books[0].notices).toEqual([]);
    });
  });

  describe('a donation the book never credits', () => {
    const old = { characterId: ME, amount: 5_000_000, at: '2026-10-14T10:00:00Z' };

    it('stops counting once the book synced 3 days after it, and is named', () => {
      const out = overlay([entry()], [book({ inFlight: [old] })]);
      expect(out.rows[0].state).toBe('billed');
      expect(out.books[0].uncredited).toEqual([{ ...old, covered: [out.rows[0].date] }]);
    });

    describe('over two days', () => {
      const day = (date: string) => ({
        characterId: ME,
        recordedCorporationId: CORP,
        structureId: 1000,
        date,
        solarSystemId: SYSTEM,
        oreLines: [{ typeId: ZEO, quantity: 43_050 }],
      });
      const twoDays = (inFlight: PersonalBook['inFlight']) =>
        overlay(
          [entry({ date: '2026-10-15' }), entry()],
          [book({ observed: [day('2026-10-15'), day('2026-10-17')], inFlight })]
        );
      const tax = 43_050 * 148 * 0.15;

      it('names both days one donation paid, and marks each as unlinked from it', () => {
        const paidBoth = { ...old, amount: Math.ceil(2 * tax) + 500_000 };
        const out = twoDays([paidBoth]);
        expect(out.books[0].uncredited).toEqual([
          { ...paidBoth, covered: ['2026-10-15', '2026-10-17'] },
        ]);
        for (const row of out.rows) {
          expect(row).toMatchObject({
            state: 'billed',
            unlinkedDonation: { amount: paidBoth.amount, at: paidBoth.at },
          });
        }
      });

      it('names only the days that went back to Billed when a newer donation still counts', () => {
        const counted = { ...old, amount: Math.ceil(tax), at: '2026-10-16T10:00:00Z' };
        const lost = { ...old, amount: Math.ceil(tax) };
        const out = twoDays([counted, lost]);
        // The pooled money paid both days; without the lost one, the newer day is owed again.
        expect(out.books[0].uncredited).toEqual([{ ...lost, covered: ['2026-10-17'] }]);
        const byDate = new Map(out.rows.map((r) => [r.date, r]));
        expect(byDate.get('2026-10-15')).toMatchObject({ state: 'paid', settledBy: 'donation' });
        expect(byDate.get('2026-10-15')).not.toHaveProperty('unlinkedDonation');
        expect(byDate.get('2026-10-17')).toMatchObject({ state: 'billed' });
      });
    });

    it('names the days it paid while it counted, so the member can dispute them', () => {
      // Too little to cover the day: it covered nothing, and says so.
      const small = { ...old, amount: 1 };
      const out = overlay([entry()], [book({ inFlight: [small] })]);
      expect(out.books[0].uncredited).toEqual([{ ...small, covered: [] }]);
    });

    it('waits for a sync that read the wallet, not just any sync', () => {
      // The book synced, but no sync since the donation could read the corp wallet.
      const unread = overlay([entry()], [book({ inFlight: [old], donationsCheckedAt: null })]);
      expect(unread.rows[0]).toMatchObject({ state: 'paid', settledBy: 'donation' });
      expect(unread.books[0].uncredited).toEqual([]);
      // The last sync that did read it was too soon after the donation.
      const early = overlay(
        [entry()],
        [book({ inFlight: [old], donationsCheckedAt: '2026-10-15T10:00:00Z' })]
      );
      expect(early.books[0].uncredited).toEqual([]);
      const late = overlay([entry()], [book({ inFlight: [old], donationsCheckedAt: SYNCED })]);
      expect(late.books[0].uncredited).toMatchObject([old]);
    });

    it('still counts while the book has not synced 3 days after it', () => {
      const recent = { ...old, at: '2026-10-16T10:00:00Z' };
      const out = overlay([entry()], [book({ inFlight: [recent] })]);
      expect(out.rows[0]).toMatchObject({ state: 'paid', settledBy: 'donation' });
      expect(out.books[0].uncredited).toEqual([]);
    });
  });

  describe("a Miner's own declaration and dispute (#6206)", () => {
    const declared = (over: Partial<Declaration> = {}): Declaration => ({
      id: 'x1',
      [NOTICE_ID_FIELD]: 'n1',
      kind: 'another-way',
      at: '2026-10-14T00:00:00.000Z',
      amount: 500_000,
      ...over,
    });

    it('marks a billed row and its Late notice as declared, waiting for the corporation', () => {
      const out = overlay([entry()], [book({ notices: [noticeOf()], declarations: [declared()] })]);
      expect(out.rows[0]).toMatchObject({
        state: 'billed',
        noticeId: 'n1',
        declaration: { state: 'waiting', at: '2026-10-14T00:00:00.000Z', amount: 500_000 },
      });
      expect(out.books[0].notices[0].declaration).toMatchObject({ state: 'waiting' });
    });

    it('reads only the latest declaration of a Late notice', () => {
      const older = declared({
        id: 'x0',
        at: '2026-10-10T00:00:00.000Z',
        resolution: { kind: 'rejected', at: '2026-10-11T00:00:00.000Z', reason: 'no' },
      });
      const out = overlay(
        [entry()],
        [book({ notices: [noticeOf()], declarations: [declared(), older] })]
      );
      expect(out.rows[0].declaration?.state).toBe('waiting');
    });

    const toOther = entry({
      freeOreLines: [],
      oreLines: [{ typeId: ZEO, quantity: 43_050 }],
      allocations: [
        {
          payeeId: 'ashfall',
          taxPct: 10,
          oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          status: 'outstanding',
        },
      ],
    });
    const dispute = (over: Partial<OreDispute> = {}): OreDispute => ({
      id: `solo_${ME}_2026-10-17`,
      minerId: `solo:${ME}`,
      date: '2026-10-17',
      lines: [
        {
          recordKey: `${ME}:1000:2026-10-17`,
          typeId: ZEO,
          quantity: 43_050,
          payeeName: 'Ashfall',
        },
      ],
      by: ME,
      at: '2026-10-18T13:00:00.000Z',
      ...over,
    });

    it('gives a Conflict row its record key, and says when it was sent to the corporation', () => {
      const before = overlay([toOther], [book()]);
      expect(before.rows[0]).toMatchObject({
        state: 'conflict',
        recordKey: `${ME}:1000:2026-10-17`,
      });
      expect(before.rows[0].flagged).toBeUndefined();
      const out = overlay([toOther], [book({ disputes: [dispute()] })]);
      expect(out.rows[0].flagged).toEqual({
        state: 'sent',
        kind: 'payee',
        at: '2026-10-18T13:00:00.000Z',
      });
    });

    it('a rejected day says so on a row the dispute did not name', () => {
      const rejected = dispute({
        lines: [{ recordKey: `${ME}:2000:2026-10-17`, typeId: ZEO, quantity: 5, payeeName: 'A' }],
        resolution: { kind: 'rejected', at: '2026-10-19T00:00:00.000Z', by: 1, reason: 'Ours' },
      });
      const out = overlay([toOther], [book({ disputes: [rejected] })]);
      expect(out.rows[0].flagged?.state).toBe('rejected');
      // An open one on another refinery leaves this row free to add its own lines.
      const open = { ...rejected };
      delete open.resolution;
      const still = overlay([toOther], [book({ disputes: [open] })]);
      expect(still.rows[0].flagged).toBeUndefined();
    });

    it('says when an officer rejected the dispute, with the reason', () => {
      const rejected = dispute({
        resolution: { kind: 'rejected', at: '2026-10-19T00:00:00.000Z', by: 1, reason: 'Ours' },
      });
      const out = overlay([toOther], [book({ disputes: [rejected] })]);
      expect(out.rows[0].flagged).toEqual({
        kind: 'payee',
        state: 'rejected',
        at: '2026-10-19T00:00:00.000Z',
        reason: 'Ours',
      });
    });

    it('says when an officer waived the disputed ore, with the reason', () => {
      const waived = dispute({
        resolution: {
          kind: 'dismissed',
          at: '2026-10-19T00:00:00.000Z',
          by: 1,
          reason: 'Theirs',
          amountIsk: 5_000,
        },
      });
      const out = overlay([toOther], [book({ disputes: [waived] })]);
      expect(out.rows[0].flagged).toEqual({
        kind: 'payee',
        state: 'dismissed',
        at: '2026-10-19T00:00:00.000Z',
        reason: 'Theirs',
      });
    });

    describe('a day an officer closed by write-off or waiver (#6307)', () => {
      const KEY = `${ME}:1000:2026-10-17`;
      const answered = (over: Partial<OreDispute> = {}) =>
        dispute({
          kind: 'notPaying',
          reason: 'Will not pay',
          lines: [{ recordKey: KEY, typeId: ZEO, quantity: 43_050, payeeName: '' }],
          ...over,
        });
      const owes = entry({
        oreLines: [{ typeId: ZEO, quantity: 43_050 }],
        freeOreLines: [{ typeId: ZEO, quantity: 43_050 }],
      });
      const nothingToDo = (out: ReturnType<typeof overlay>) => {
        expect(out.books[0].notices).toEqual([]);
      };

      it('a waived dispute that credits the whole day leaves every open area and reads Waived', () => {
        const day = DAY;
        const waivedAll = answered({
          resolution: {
            kind: 'dismissed',
            at: '2026-10-19T00:00:00.000Z',
            by: 1,
            reason: 'Fair',
            amountIsk: day,
          },
        });
        const out = overlay(
          [owes],
          [
            book({
              notices: [noticeOf({ issuedAt: '2026-10-01T00:00:00Z' })],
              adjustments: [
                {
                  id: 'a9',
                  minerId: `solo:${ME}`,
                  date: '2026-10-17',
                  amount: -day,
                  reason: 'Fair',
                  by: 1,
                  at: '2026-10-19T00:00:00.000Z',
                },
              ],
              disputes: [waivedAll],
            }),
          ]
        );
        expect(out.rows[0]).toMatchObject({ state: 'waived', taxOwed: 0 });
        expect(out.rows[0].flagged?.state).toBe('dismissed');
        nothingToDo(out);
      });
    });
  });
});

describe('resolving in the app: an open dispute holds its day', () => {
  const keyOf = (date: string) => `${ME}:1000:${date}`;
  const observedOn = (dates: string[]) =>
    dates.map((date) => ({
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date,
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 10_000 }],
    }));
  const disputeOn = (date: string, over: Partial<OreDispute> = {}): OreDispute => ({
    id: `solo_${date}`,
    minerId: `solo:${ME}`,
    date,
    kind: 'notPaying',
    reason: 'The fleet boss said this op was untaxed',
    lines: [{ recordKey: keyOf(date), typeId: ZEO, quantity: 10_000, payeeName: '' }],
    by: ME,
    at: '2026-10-18T13:00:00.000Z',
    ...over,
  });
  const DAYS = ['2026-10-15', '2026-10-16', '2026-10-17'];
  // 10,000 × 148 × 15% = 222,000 a day.
  const days = () =>
    DAYS.map((date) => entry({ date, oreLines: [{ typeId: ZEO, quantity: 10_000 }] }));

  it('lets a billed day carry a dispute: its record, what was said, and the hold', () => {
    const out = overlay(
      [entry()],
      [
        book({
          disputes: [
            disputeOn('2026-10-17', {
              lines: [
                { recordKey: keyOf('2026-10-17'), typeId: ZEO, quantity: 43_050, payeeName: '' },
              ],
            }),
          ],
        }),
      ]
    );
    expect(out.rows[0]).toMatchObject({
      state: 'billed',
      recordKey: keyOf('2026-10-17'),
      flagged: { state: 'sent' },
      held: { kind: 'notPaying', until: '2026-11-01T13:00:00.000Z' },
    });
  });

  // The officer's next step must reach the member word for word on the billed day itself.
  it('says a rejected quantity dispute on a billed, unpaid day, with the next step', () => {
    const rejected = disputeOn('2026-10-17', {
      kind: 'quantity',
      reason: 'Your ledger is short',
      resolution: {
        kind: 'rejected',
        at: '2026-10-19T00:00:00.000Z',
        by: 1,
        reason: 'The book is right',
        nextStep: 'Pay it, or re-mine the shortfall',
      },
    });
    const out = overlay([entry()], [book({ disputes: [rejected] })]);
    expect(out.rows[0]).toMatchObject({
      state: 'billed',
      flagged: {
        state: 'rejected',
        kind: 'quantity',
        reason: 'The book is right',
        nextStep: 'Pay it, or re-mine the shortfall',
      },
    });
    expect(out.rows[0].held).toBeUndefined();
  });

  // "Say it again" repeats the claim: the flag carries the ore this record disputed and the rate.
  it("keeps a kept dispute's own claim on the flag: its ore and its rate", () => {
    const rejected = disputeOn('2026-10-17', {
      kind: 'rate',
      claimedPct: 3,
      lines: [{ recordKey: keyOf('2026-10-17'), typeId: ZEO, quantity: 1_000, payeeName: '' }],
      resolution: { kind: 'rejected', at: '2026-10-19T00:00:00.000Z', by: 1, reason: 'No' },
    });
    const out = overlay([entry()], [book({ disputes: [rejected] })]);
    expect(out.rows[0].flagged).toMatchObject({ kind: 'rate', claimedPct: 3 });
    const quantity = disputeOn('2026-10-17', {
      kind: 'quantity',
      lines: [{ recordKey: keyOf('2026-10-17'), typeId: ZEO, quantity: 1_000, payeeName: '' }],
      resolution: { kind: 'rejected', at: '2026-10-19T00:00:00.000Z', by: 1, reason: 'No' },
    });
    expect(overlay([entry()], [book({ disputes: [quantity] })]).rows[0].flagged?.lines).toEqual([
      { typeId: ZEO, quantity: 1_000 },
    ]);
  });

  it('skips a held day: a donation pays the next oldest instead', () => {
    const out = overlay(days(), [
      book({
        observed: observedOn(DAYS),
        disputes: [disputeOn('2026-10-15')],
        inFlight: [{ characterId: ME, amount: 222_000, at: '2026-10-18T13:10:00Z' }],
      }),
    ]);
    const byDate = Object.fromEntries(out.rows.map((r) => [r.date, r.state]));
    expect(byDate).toEqual({
      '2026-10-15': 'billed',
      '2026-10-16': 'paid',
      '2026-10-17': 'billed',
    });
  });

  it('holds nothing once an officer has answered', () => {
    const answered = disputeOn('2026-10-15', {
      resolution: { kind: 'rejected', at: '2026-10-18T14:00:00.000Z', by: 1, reason: 'ours' },
    });
    const out = overlay(days(), [
      book({
        observed: observedOn(DAYS),
        disputes: [answered],
        inFlight: [{ characterId: ME, amount: 222_000, at: '2026-10-18T13:10:00Z' }],
      }),
    ]);
    expect(out.rows.find((r) => r.date === '2026-10-15')).toMatchObject({ state: 'paid' });
    expect(out.rows.find((r) => r.date === '2026-10-15')?.held).toBeUndefined();
  });

  // The member's own record governs which days *they* paid: a mark pays the day it names. (Until
  // the fix for the Bureau report, marks were pooled and spent on the oldest open days, so a
  // member who marked 11-06 paid saw it stay Billed while an older day turned Paid.)

  // The Bureau report (2026-11-16): one 10,898,549 ISK donation paid 11-06 and 11-07, which the
  // member marked paid. The book's credit pays a Miner's oldest open day (11-01) first.

  describe('a disputed Conflict day', () => {
    const assigned = () =>
      entry({
        freeOreLines: [],
        oreLines: [{ typeId: ZEO, quantity: 43_050 }],
        allocations: [
          {
            payeeId: 'ashfall',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 43_050 }],
            status: 'outstanding',
          },
        ],
      });
    // Its own clock runs out on 2026-11-01T00:30; the dispute, raised 25 Oct, holds to 8 Nov.
    const told = disputeOn('2026-10-17', {
      kind: undefined,
      reason: undefined,
      at: '2026-10-25T00:00:00.000Z',
      lines: [
        { recordKey: keyOf('2026-10-17'), typeId: ZEO, quantity: 43_050, payeeName: 'Ashfall' },
      ],
    });

    it('does not resolve to the corporation while the dispute holds it', () => {
      const out = overlay([assigned()], [book({ disputes: [told] })], '2026-11-02T00:00:00Z');
      expect(out.rows[0]).toMatchObject({
        state: 'conflict',
        resolvesAt: '2026-11-08T00:00:00.000Z',
      });
    });

    it('resolves once the hold runs out unanswered', () => {
      const out = overlay([assigned()], [book({ disputes: [told] })], '2026-11-09T00:00:00Z');
      expect(out.rows.some((r) => r.state === 'conflict')).toBe(false);
    });
  });
});
