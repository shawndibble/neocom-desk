import { describe, expect, it } from 'vitest';
import {
  coverInFlight,
  inFlightDonations,
  overlayCorpBooks,
  type PersonalBook,
  type PersonalEntry,
} from './personal';
import type { Statement } from './statements';

const CORP = 98000001;
const ME = 90000001;
const SYSTEM = 30003838;
const ZEO = 45490;
const SYL = 45491;

const NOW = '2026-10-18T14:00:00Z';
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
  statements: [],
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
    const out = overlay([entry()], [book({ lastSyncedAt: '2026-10-18T01:00:00Z' })]);
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
    const out = overlay([entry()], [book(), other]);
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
    expect(out.rows[0]).toMatchObject({ state: 'conflict', taxOwed: null });
    // Closed at 18 Oct 00:00 + 6h grace on the 17th → 14 days after 2026-10-18T06:00.
    expect(out.rows[0].resolvesAt).toBe('2026-11-01T06:00:00.000Z');
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

  it('uses the issued Statement line, which never changes, and settles it from payments', () => {
    const statement: Statement = {
      id: 's1',
      minerId: `solo:${ME}`,
      code: 'ABC',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      coversFrom: '2026-10-01',
      coversThrough: '2026-10-17',
      issuedAt: '2026-10-18T00:00:00Z',
      hubId: 'jita',
      oreForm: 'compressed',
      amount: 900_000,
      lines: [
        {
          kind: 'mined',
          date: '2026-10-17',
          chargeKey: `${ME}:1000:2026-10-17`,
          characterId: ME,
          structureId: 1000,
          oreLines: [{ typeId: ZEO, quantity: 43_050 }],
          unitPrices: { [ZEO]: 140 },
          taxPct: 15,
          estimatedValue: 6_000_000,
          tax: 900_000,
        },
      ],
    };
    const open = overlay([entry()], [book({ statements: [statement] })]);
    expect(open.rows[0]).toMatchObject({ state: 'billed', taxOwed: 900_000, statementId: 's1' });
    const paid = overlay(
      [entry()],
      [
        book({
          statements: [statement],
          payments: [
            {
              id: 'p1',
              minerId: `solo:${ME}`,
              characterId: ME,
              amount: 900_000,
              at: '2026-10-18T10:00:00Z',
              source: 'donation',
            },
          ],
        }),
      ]
    );
    expect(paid.rows[0]).toMatchObject({ state: 'paid', taxOwed: 0 });
  });

  describe('mixed-rate days', () => {
    const billedLine = (
      over: Partial<Statement['lines'][number]> & { structureId: number }
    ): Statement['lines'][number] => ({
      kind: 'mined',
      date: '2026-10-17',
      chargeKey: `${ME}:${over.structureId}:2026-10-17`,
      characterId: ME,
      oreLines: [{ typeId: ZEO, quantity: 1_000 }],
      unitPrices: { [ZEO]: 100 },
      taxPct: 10,
      estimatedValue: 100_000,
      tax: 10_000,
      ...over,
    });
    const statementOf = (lines: Statement['lines']): Statement => ({
      id: 's1',
      minerId: `solo:${ME}`,
      code: 'ABC',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      coversFrom: '2026-10-01',
      coversThrough: '2026-10-17',
      issuedAt: '2026-10-18T00:00:00Z',
      hubId: 'jita',
      oreForm: 'compressed',
      amount: lines.reduce((sum, l) => sum + l.tax, 0),
      lines,
    });
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

    it('a Statement day gives the same per-line tax as the open day', () => {
      const lines = [
        billedLine({ structureId: 1000 }),
        billedLine({ structureId: 2000, taxPct: 7, tax: 7_000 }),
      ];
      const open = overlay(
        [],
        [
          book({
            rates,
            pricesOn: pricesAt100,
            observed: [observed(1000, 1_000), observed(2000, 1_000, FEEDER)],
          }),
        ]
      );
      const billed = overlay(
        [],
        [
          book({
            rates,
            pricesOn: pricesAt100,
            observed: [observed(1000, 1_000), observed(2000, 1_000, FEEDER)],
            statements: [statementOf(lines)],
          }),
        ]
      );
      expect(billed.rows.map((r) => r.taxPct)).toEqual(open.rows.map((r) => r.taxPct));
      billed.rows.forEach((r, i) => expect(r.taxOwed).toBeCloseTo(open.rows[i].taxOwed ?? 0, 6));
    });

    it('shows the effective rate when one charge was billed at two rates after a rate fix', () => {
      const lines = [
        billedLine({ structureId: 1000 }),
        billedLine({
          structureId: 1000,
          kind: 'late-ore',
          oreLines: [{ typeId: ZEO, quantity: 1_000 }],
          taxPct: 20,
          tax: 20_000,
        }),
      ];
      const out = overlay(
        [],
        [
          book({
            pricesOn: pricesAt100,
            observed: [observed(1000, 2_000)],
            statements: [statementOf(lines)],
          }),
        ]
      );
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toMatchObject({ taxOwed: 30_000, estimatedValue: 200_000, taxPct: 15 });
    });
  });

  it('applies a part payment to the oldest days first', () => {
    const mk = (date: string, tax: number) => ({
      kind: 'mined' as const,
      date,
      chargeKey: `${ME}:1000:${date}`,
      characterId: ME,
      structureId: 1000,
      oreLines: [{ typeId: ZEO, quantity: 1000 }],
      unitPrices: { [ZEO]: 100 },
      taxPct: 15,
      estimatedValue: tax * 5,
      tax,
    });
    const statement: Statement = {
      id: 's1',
      minerId: `solo:${ME}`,
      code: 'ABC',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      coversFrom: '2026-10-01',
      coversThrough: '2026-10-17',
      issuedAt: '2026-10-18T00:00:00Z',
      hubId: 'jita',
      oreForm: 'compressed',
      amount: 3_000_000,
      lines: [mk('2026-10-16', 1_000_000), mk('2026-10-17', 2_000_000)],
    };
    const observed = ['2026-10-16', '2026-10-17'].map((date) => ({
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date,
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 1000 }],
    }));
    const out = overlay(
      [
        entry({
          date: '2026-10-16',
          oreLines: [{ typeId: ZEO, quantity: 1000 }],
          freeOreLines: [],
        }),
        entry({
          date: '2026-10-17',
          oreLines: [{ typeId: ZEO, quantity: 1000 }],
          freeOreLines: [],
        }),
      ],
      [
        book({
          statements: [statement],
          observed,
          payments: [
            {
              id: 'p1',
              minerId: `solo:${ME}`,
              characterId: ME,
              amount: 1_500_000,
              at: '2026-10-18T10:00:00Z',
              source: 'donation',
            },
          ],
        }),
      ]
    );
    const byDate = Object.fromEntries(out.rows.map((r) => [r.date, r]));
    expect(byDate['2026-10-16']).toMatchObject({ state: 'paid', taxOwed: 0 });
    expect(byDate['2026-10-17']).toMatchObject({ state: 'billed', taxOwed: 1_500_000 });
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

  it('turns the oldest Billed days into Sent, waiting while a donation is in flight', () => {
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
      book({ observed, inFlight: [{ amount: 222_000, at: '2026-10-18T13:10:00Z' }] }),
    ]);
    const byDate = Object.fromEntries(out.rows.map((r) => [r.date, r.state]));
    expect(byDate).toEqual({
      '2026-10-15': 'sent-waiting',
      '2026-10-16': 'billed',
      '2026-10-17': 'billed',
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

describe('inFlightDonations', () => {
  const made = (over = {}) => ({
    characterId: ME,
    counterpartyId: CORP,
    amount: 500_000,
    date: '2026-10-18T13:10:00Z',
    method: 'donation' as const,
    ...over,
  });

  it('counts donations to the corp the book has not credited yet', () => {
    expect(inFlightDonations([made()], [], CORP, '2026-10-01')).toEqual([
      { amount: 500_000, at: '2026-10-18T13:10:00Z' },
    ]);
  });

  it('skips a donation the book already holds, within a few minutes', () => {
    const held = [
      { characterId: ME, amount: 500_000, at: '2026-10-18T13:12:00Z', notTaxAmount: 0 },
    ];
    expect(inFlightDonations([made()], held, CORP, '2026-10-01')).toEqual([]);
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

describe('coverInFlight', () => {
  it('covers whole rows oldest first, within the settle tolerance', () => {
    const rows = [
      { id: 'a', date: '2026-10-01', taxOwed: 1_000_000 },
      { id: 'b', date: '2026-10-02', taxOwed: 1_000_000 },
    ];
    expect(coverInFlight(rows, 1_050_000)).toEqual(new Set(['a']));
    expect(coverInFlight(rows, 2_000_000)).toEqual(new Set(['a', 'b']));
    expect(coverInFlight(rows, 10)).toEqual(new Set());
    // Nothing in flight covers nothing, even a day smaller than the tolerance.
    expect(coverInFlight([{ id: 'c', date: '2026-10-03', taxOwed: 50_000 }], 0)).toEqual(new Set());
  });
});
