import { describe, expect, it } from 'vitest';
import {
  memberCoverageOf,
  appendRequestedRate,
  buildFeederView,
  deriveModeChanges,
  deriveOwnerRateHistory,
  hubStationId,
  parseOpenPriceDays,
  priceKey,
  type FeederViewInput,
  type FeederViewRecord,
} from './corpTaxBookFeederView.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const JOINED = Date.parse('2026-10-10T08:00:00Z');

const record = (over: Partial<FeederViewRecord> = {}): FeederViewRecord => ({
  status: 'active',
  mode: 'normal',
  joinedAt: JOINED,
  lastReadWellAt: NOW - 1000,
  coveragePeriods: [{ from: '2026-10-10' }],
  agreedRatePct: 10,
  ...over,
});

const row = (date: string, quantity: number, over = {}) => ({
  structureId: 77,
  characterId: 900,
  typeId: 18,
  date,
  quantity,
  ...over,
});

const input = (over: Partial<FeederViewInput> = {}): FeederViewInput => ({
  now: NOW,
  feederCorporationId: 98000002,
  collectorCorporationId: 98000001,
  collectorName: 'B-UH',
  record: record(),
  graceHours: 6,
  oreForm: 'compressed',
  compressedByRaw: { '18': 62528 },
  rows: [],
  prices: new Map(),
  payouts: [],
  ...over,
});

describe('hubStationId', () => {
  it('maps the book hub to its station', () => {
    expect(hubStationId('jita')).toBe(60003760);
    expect(hubStationId('hek')).toBe(60005686);
    expect(hubStationId('nowhere')).toBe(60003760);
  });
});

describe('parseOpenPriceDays', () => {
  it('reads the station series by date', () => {
    const body = {
      dates: ['2026-10-12', '2026-10-13'],
      stations: { '60003760': { buy: [5, null], sell: [6, 7] } },
    };
    expect(parseOpenPriceDays(body, 60003760)).toEqual(
      new Map([
        ['2026-10-12', { buy: 5, sell: 6 }],
        ['2026-10-13', { buy: null, sell: 7 }],
      ])
    );
  });

  it('returns nothing for a malformed or foreign object', () => {
    expect(parseOpenPriceDays(null, 1).size).toBe(0);
    expect(parseOpenPriceDays({ dates: 3 }, 1).size).toBe(0);
    expect(parseOpenPriceDays({ dates: ['2026-10-12'], stations: {} }, 1).size).toBe(0);
  });
});

describe('derived histories', () => {
  it('derives rate entries from the record when there is no history', () => {
    const h = deriveOwnerRateHistory(record({ requestedRatePct: 6, agreedRatePct: 8 }));
    expect(h).toEqual([
      {
        kind: 'requested',
        pct: 6,
        effectiveFrom: '2026-10-10',
        recordedAt: '2026-10-10T08:00:00.000Z',
      },
      {
        kind: 'agreed',
        pct: 8,
        effectiveFrom: '2026-10-10',
        recordedAt: '2026-10-10T08:00:00.000Z',
      },
    ]);
    expect(deriveOwnerRateHistory(record({ agreedRatePct: undefined }))).toEqual([]);
  });

  it('prefers a stored history', () => {
    const stored = [
      { kind: 'agreed' as const, pct: 3, effectiveFrom: '2026-10-11', recordedAt: 'x' },
    ];
    expect(deriveOwnerRateHistory(record({ ownerRateHistory: stored, agreedRatePct: 9 }))).toBe(
      stored
    );
  });

  it('derives settled-otherwise from the join day, nothing for normal', () => {
    expect(deriveModeChanges(record())).toEqual([]);
    expect(deriveModeChanges(record({ mode: 'settled-otherwise' }))).toEqual([
      { from: '2026-10-10', mode: 'settled-otherwise' },
    ]);
    const stored = [{ from: '2026-10-12', mode: 'normal' as const }];
    expect(deriveModeChanges(record({ modeChanges: stored }))).toBe(stored);
  });

  it('appends a requested rate dated today without touching the rest', () => {
    const next = appendRequestedRate(record({ requestedRatePct: 4 }), 6, NOW);
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({
      kind: 'requested',
      pct: 6,
      effectiveFrom: '2026-10-20',
      recordedAt: '2026-10-20T12:00:00.000Z',
    });
  });
});

describe('buildFeederView', () => {
  const prices = new Map([
    [priceKey(62528, '2026-10-12'), { buy: 100, sell: 120 }],
    [priceKey(62528, '2026-10-13'), { buy: null, sell: 50 }],
    [priceKey(62528, '2026-10-14'), { buy: null, sell: null }],
  ]);

  it('values covered days, accrues at the effective rate and balances against payouts', () => {
    const v = buildFeederView(
      input({
        rows: [
          row('2026-10-12', 10),
          row('2026-10-12', 5, { characterId: 901 }),
          row('2026-10-13', 4),
          row('2026-10-05', 99), // before coverage
        ],
        prices,
        payouts: [
          {
            id: 'a',
            date: '2026-10-15',
            amount: 40,
            method: 'donation',
            status: 'matched',
            notAPayout: false,
          },
          {
            id: 'b',
            date: '2026-10-16',
            amount: 500,
            method: 'donation',
            status: 'recorded',
            notAPayout: true,
          },
        ],
      })
    );
    const s = v.summary;
    expect(s.minedVolume).toBe(19);
    // day 12: 15 x 100; day 13: 4 x 50 (sell fallback)
    expect(s.minedValueIsk).toBe(1700);
    expect(s.accruedIsk).toBe(170);
    expect(s.paidIsk).toBe(40);
    expect(s.balanceKind).toBe('owed');
    expect(s.balanceIsk).toBe(130);
    expect(s.lastPayout).toEqual({ date: '2026-10-15', amount: 40 });
    expect(s.effectiveRatePct).toBe(10);
    expect(s.coverageFrom).toBe('2026-10-10');
    expect(s.coverageTo).toBeNull();
    expect(s.refineryCount).toBe(1);
    expect(s.schemaVersion).toBe(1);
    expect(v.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-13']);
    expect(v.days[0]).toMatchObject({
      billable: true,
      pct: 10,
      dueIsk: 150,
      valueIsk: 1500,
      lines: [
        { characterId: 900, structureId: 77, volume: 10, valueIsk: 1000 },
        { characterId: 901, structureId: 77, volume: 5, valueIsk: 500 },
      ],
    });
    expect(v.payouts).toEqual([
      { id: 'a', date: '2026-10-15', amount: 40, method: 'donation', status: 'matched' },
    ]);
  });

  it('keeps unread days out of the accrual but still shows them', () => {
    // Read well at 2026-10-13 05:00: day 12 closed at 13th 06:00 -> not billable
    const lastRead = Date.parse('2026-10-13T05:00:00Z');
    const v = buildFeederView(
      input({
        record: record({ lastReadWellAt: lastRead, staleSince: lastRead + 1 }),
        rows: [row('2026-10-11', 10), row('2026-10-12', 10)],
        prices: new Map([
          [priceKey(62528, '2026-10-11'), { buy: 10, sell: null }],
          [priceKey(62528, '2026-10-12'), { buy: 10, sell: null }],
        ]),
      })
    );
    expect(v.days.map((d) => [d.date, d.billable, d.dueIsk])).toEqual([
      ['2026-10-11', true, 10],
      ['2026-10-12', false, 0],
    ]);
    expect(v.summary.accruedIsk).toBe(10);
    expect(v.summary.minedValueIsk).toBe(200);
    expect(v.summary.staleSince).toBe(lastRead + 1);
  });

  it('counts billable days with an unpriced ore, valuing them at 0', () => {
    const v = buildFeederView(
      input({ rows: [row('2026-10-14', 10), row('2026-10-15', 1)], prices })
    );
    expect(v.summary.unpricedDays).toBe(2);
    expect(v.summary.minedValueIsk).toBe(0);
  });

  it('values raw ore at the raw type when the book is not compressed', () => {
    const v = buildFeederView(
      input({
        oreForm: 'raw',
        rows: [row('2026-10-12', 2)],
        prices: new Map([[priceKey(18, '2026-10-12'), { buy: 7, sell: null }]]),
      })
    );
    expect(v.summary.minedValueIsk).toBe(14);
  });

  it('shows no number when settled otherwise, and keeps volume and value', () => {
    const v = buildFeederView(
      input({
        record: record({ mode: 'settled-otherwise', note: 'fuel' }),
        rows: [row('2026-10-12', 10)],
        prices,
      })
    );
    expect(v.summary).toMatchObject({
      mode: 'settled-otherwise',
      note: 'fuel',
      balanceKind: 'none',
      balanceIsk: 0,
      accruedIsk: 0,
      minedVolume: 10,
      minedValueIsk: 1000,
    });
  });

  it('has no rate set when nothing is agreed or requested', () => {
    const v = buildFeederView(
      input({ record: record({ agreedRatePct: undefined }), rows: [row('2026-10-12', 10)], prices })
    );
    expect(v.summary).toMatchObject({
      effectiveRatePct: null,
      requestedRatePct: null,
      agreedRatePct: null,
      accruedIsk: 0,
      balanceKind: 'even',
    });
    expect(v.days[0].pct).toBeNull();
  });

  it('lets the agreed rate win over a later request', () => {
    const v = buildFeederView(
      input({
        record: record({
          ownerRateHistory: [
            {
              kind: 'agreed',
              pct: 8,
              effectiveFrom: '2026-10-10',
              recordedAt: '2026-10-10T00:00:00Z',
            },
            {
              kind: 'requested',
              pct: 6,
              effectiveFrom: '2026-10-15',
              recordedAt: '2026-10-15T00:00:00Z',
            },
          ],
        }),
      })
    );
    expect(v.summary).toMatchObject({
      effectiveRatePct: 8,
      requestedRatePct: 6,
      agreedRatePct: 8,
    });
    expect(v.summary.rateHistory).toHaveLength(2);
  });

  it('reports credit and a closed coverage after leaving', () => {
    const v = buildFeederView(
      input({
        record: record({
          status: 'left',
          leftAt: Date.parse('2026-10-14T10:00:00Z'),
          coveragePeriods: [{ from: '2026-10-10', to: '2026-10-13' }],
          viewDismissedAt: 5,
        }),
        rows: [row('2026-10-12', 10), row('2026-10-14', 10)],
        prices,
        payouts: [
          {
            id: 'a',
            date: '2026-10-15',
            amount: 1000,
            method: 'other',
            status: 'recorded',
            notAPayout: false,
          },
        ],
      })
    );
    expect(v.summary).toMatchObject({
      status: 'left',
      leftAt: Date.parse('2026-10-14T10:00:00Z'),
      coverageTo: '2026-10-13',
      accruedIsk: 100,
      balanceKind: 'credit',
      balanceIsk: 900,
      dismissedAt: 5,
    });
    expect(v.days.map((d) => d.date)).toEqual(['2026-10-12']);
  });

  it('never carries miner debts, miner rate or margin', () => {
    const v = buildFeederView(input({ rows: [row('2026-10-12', 10)], prices }));
    const text = JSON.stringify(v);
    for (const word of ['minerRate', 'margin', 'statement', 'debt']) {
      expect(text).not.toContain(word);
    }
    expect(DAY).toBeGreaterThan(0);
  });

  it('labels refineries from the system a row recorded', () => {
    const v = buildFeederView(
      input({
        rows: [
          row('2026-10-12', 1, { solarSystemId: 30000142 }),
          row('2026-10-12', 1, { structureId: 78 }),
        ],
      })
    );
    expect(v.refineries).toEqual([
      { structureId: 77, label: null, labelSetAt: null, solarSystemId: 30000142 },
      { structureId: 78, label: null, labelSetAt: null, solarSystemId: null },
    ]);
    expect(v.summary.refineryCount).toBe(2);
  });

  it("carries the label either side's officers set, kept on the record (#4640)", () => {
    const v = buildFeederView(
      input({
        record: record({
          refineryLabels: {
            '77': {
              label: 'Efa Tatara',
              setAt: '2026-10-12T00:00:00.000Z',
              setBy: 1,
              side: 'accounting',
            },
          },
        }),
        rows: [row('2026-10-12', 1), row('2026-10-12', 1, { structureId: 78 })],
      })
    );
    expect(v.refineries).toEqual([
      {
        structureId: 77,
        label: 'Efa Tatara',
        labelSetAt: '2026-10-12T00:00:00.000Z',
        solarSystemId: null,
      },
      { structureId: 78, label: null, labelSetAt: null, solarSystemId: null },
    ]);
  });

  it("falls back to the system learned from a miner's ledger; a row's own wins (#4650)", () => {
    const v = buildFeederView(
      input({
        record: record({ refinerySystems: { '77': 30002187, '78': 30002187 } }),
        rows: [
          row('2026-10-12', 1),
          row('2026-10-12', 1, { structureId: 78 }),
          row('2026-10-13', 1, { structureId: 78, solarSystemId: 30000142 }),
        ],
      })
    );
    expect(v.refineries.map((r) => [r.structureId, r.solarSystemId])).toEqual([
      [77, 30002187],
      [78, 30000142],
    ]);
  });
});

describe('review fixes', () => {
  it('does not grow the history when the standing request is sent again', () => {
    const once = appendRequestedRate(record({ requestedRatePct: 4 }), 6, NOW);
    const again = appendRequestedRate(
      record({ requestedRatePct: 6, ownerRateHistory: once }),
      6,
      NOW
    );
    expect(again).toEqual(once);
  });

  it('shows the note only while settled otherwise', () => {
    const normal = buildFeederView(
      input({ record: record({ mode: 'normal', note: 'slow payer' }) })
    );
    expect(normal.summary.note).toBeNull();
    const settled = buildFeederView(
      input({ record: record({ mode: 'settled-otherwise', note: 'fuel' }) })
    );
    expect(settled.summary.note).toBe('fuel');
  });

  it('carries the payee the moon owner set, null when unset (#4619)', () => {
    expect(buildFeederView(input()).summary.payee).toBeNull();
    const set = buildFeederView(
      input({ record: record({ payee: { kind: 'character', id: 77 } }) })
    );
    expect(set.summary.payee).toEqual({ kind: 'character', id: 77 });
  });
});

describe('memberCoverageOf (#4622)', () => {
  it('copies coverage and the read clock only, whatever else the record holds', () => {
    const record = {
      coveragePeriods: [{ from: '2026-10-01', to: '2026-10-09' }, { from: '2026-10-12' }],
      lastReadWellAt: 5,
      payee: { kind: 'character', id: 9 },
      note: 'private',
      agreedRatePct: 7,
      corporationName: 'Moon Owner Inc',
    } as unknown as Parameters<typeof memberCoverageOf>[0];
    expect(memberCoverageOf(record)).toEqual({
      coveragePeriods: [{ from: '2026-10-01', to: '2026-10-09' }, { from: '2026-10-12' }],
      lastReadWellAt: 5,
    });
  });

  it('leaves the read clock out before the first good read', () => {
    expect(memberCoverageOf({ coveragePeriods: [{ from: '2026-10-01' }] })).toEqual({
      coveragePeriods: [{ from: '2026-10-01' }],
    });
  });
});
