import { describe, it, expect } from 'vitest';
import {
  buildBookView,
  extractionDetail,
  planStatementRun,
  statementForLine,
  type BookViewInput,
  type DayRow,
  type ExtractionRow,
} from './bookView';
import {
  activityFeed,
  daysByPhase,
  statementAdjustment,
  minerMoons,
  minersOnMoon,
  moonByStructure,
  moonSchedule,
  oreTaxLines,
  paymentLedger,
  splitPlace,
} from './bookSections';

const CORP = 98000001;
const VELDSPAR = 1230;
const SCORDITE = 1228;

const day = (over: Partial<DayRow> & { key: string }): DayRow => ({
  date: '2026-09-10',
  structureId: 1001,
  characterId: 1,
  oreLines: [{ typeId: VELDSPAR, quantity: 100 }],
  unitPrices: { [VELDSPAR]: 10 },
  estimatedValue: 1000,
  taxPct: 10,
  tax: 100,
  status: 'unbilled',
  ...over,
});

describe('daysByPhase', () => {
  it('splits open days into Next Statement and Still accruing, leaving closed days out', () => {
    const days = [
      day({ key: 'a', status: 'unbilled' }),
      day({ key: 'b', status: 'not-billable' }),
      day({ key: 'c', status: 'paid' }),
      day({ key: 'd', status: 'unbilled' }),
      day({ key: 'e', status: 'dismissed' }),
      day({ key: 'f', status: 'on-statement' }),
    ];
    const split = daysByPhase(days);
    expect(split.nextStatement.map((d) => d.key)).toEqual(['a', 'd']);
    expect(split.stillAccruing.map((d) => d.key)).toEqual(['b']);
    expect(split.earlier.map((d) => d.key)).toEqual(['c', 'e', 'f']);
  });
});

describe('moonSchedule', () => {
  const now = '2026-10-20T12:00:00Z';
  const row = (id: string, over: Partial<ExtractionRow>): ExtractionRow => ({
    id,
    structureId: 1,
    moonId: 1,
    state: 'extracting',
    startedAt: '2026-10-01T00:00:00Z',
    chunkArrivalAt: '2026-10-30T00:00:00Z',
    oreSource: 'unknown',
    oreLines: [],
    estimatedValue: null,
    minedPct: null,
    tax: 0,
    minerCount: 0,
    ...over,
  });

  it('orders Fractured, Ready, then Extracting moons popping within 7 days', () => {
    const rows = [
      row('far', { chunkArrivalAt: '2026-10-28T12:00:01Z' }),
      row('edge', { chunkArrivalAt: '2026-10-27T12:00:00Z' }),
      row('soon', { chunkArrivalAt: '2026-10-21T00:00:00Z' }),
      row('ready', { state: 'ready', chunkArrivalAt: '2026-10-20T10:00:00Z' }),
      row('frac2', { state: 'fractured', expiresAt: '2026-10-25T00:00:00Z' }),
      row('frac1', { state: 'fractured', expiresAt: '2026-10-22T00:00:00Z' }),
      row('gone', { state: 'expired' }),
    ];
    const s = moonSchedule(rows, now);
    expect(s.fractured.map((r) => r.id)).toEqual(['frac1', 'frac2']);
    expect(s.ready.map((r) => r.id)).toEqual(['ready']);
    expect(s.pops.map((r) => r.id)).toEqual(['soon', 'edge']);
  });

  it('leaves an extracting row whose arrival has already passed out of Pops', () => {
    const s = moonSchedule([row('late', { chunkArrivalAt: '2026-10-19T00:00:00Z' })], now);
    expect(s.pops).toEqual([]);
  });
});

describe('oreTaxLines', () => {
  it('groups by ore and splits each day tax and value by value share', () => {
    const d = day({
      key: 'a',
      oreLines: [
        { typeId: VELDSPAR, quantity: 100 },
        { typeId: SCORDITE, quantity: 50 },
      ],
      unitPrices: { [VELDSPAR]: 10, [SCORDITE]: 20 },
      estimatedValue: 2000,
      tax: 200,
    });
    const lines = oreTaxLines([d, { ...d, key: 'b' }]);
    expect(lines.map((l) => l.typeId).sort()).toEqual([SCORDITE, VELDSPAR]);
    const total = lines.reduce(
      (s, l) => ({ q: s.q + l.quantity, v: s.v + l.value, t: s.t + l.tax }),
      {
        q: 0,
        v: 0,
        t: 0,
      }
    );
    expect(total.q).toBe(300);
    expect(total.v).toBeCloseTo(4000, 6);
    expect(total.t).toBeCloseTo(400, 6);
    expect(lines.find((l) => l.typeId === VELDSPAR)).toMatchObject({ quantity: 200 });
    expect(lines.find((l) => l.typeId === VELDSPAR)!.tax).toBeCloseTo(200, 6);
  });

  it('falls back to quantity share when no price is known', () => {
    const d = day({
      key: 'a',
      oreLines: [
        { typeId: VELDSPAR, quantity: 300 },
        { typeId: SCORDITE, quantity: 100 },
      ],
      unitPrices: {},
      estimatedValue: 400,
      tax: 40,
    });
    const lines = oreTaxLines([d]);
    expect(lines.find((l) => l.typeId === VELDSPAR)!.tax).toBeCloseTo(30, 6);
  });
});

describe('oreTaxLines edge cases', () => {
  it('keeps the tax of a day with no ore lines as one other line', () => {
    const lines = oreTaxLines([day({ key: 'a', oreLines: [], tax: 40, estimatedValue: 400 })]);
    expect(lines).toEqual([{ typeId: 0, quantity: 0, value: 400, tax: 40 }]);
  });

  it('adds up to the days exactly when a day splits unevenly', () => {
    const d = day({
      key: 'a',
      oreLines: [
        { typeId: VELDSPAR, quantity: 1 },
        { typeId: SCORDITE, quantity: 1 },
        { typeId: 1224, quantity: 1 },
      ],
      unitPrices: { [VELDSPAR]: 1, [SCORDITE]: 1, 1224: 1 },
      estimatedValue: 100,
      tax: 10,
    });
    const lines = oreTaxLines([d, { ...d, key: 'b' }, { ...d, key: 'c' }]);
    expect(lines.reduce((s, l) => s + l.tax, 0)).toBe(30);
    expect(lines.reduce((s, l) => s + l.value, 0)).toBe(300);
  });
});

describe('splitPlace', () => {
  it('drops the moon name from the front of the station name', () => {
    expect(splitPlace('Efa VII - Moon 1 - Brass Anvil', 'Efa VII - Moon 1')).toEqual({
      moon: 'Efa VII - Moon 1',
      station: 'Brass Anvil',
    });
  });
  it('drops a leading system name the moon name starts with', () => {
    expect(splitPlace('New Caldari - Brass Anvil', 'New Caldari VII - Moon 3')).toEqual({
      moon: 'New Caldari VII - Moon 3',
      station: 'Brass Anvil',
    });
    expect(splitPlace('Efa VII - Brass Anvil', 'Efa VII - Moon 1').station).toBe('Brass Anvil');
  });
  it('leaves an officer label and a placeholder alone', () => {
    expect(splitPlace('Brass Anvil', 'Efa VII - Moon 1').station).toBe('Brass Anvil');
    expect(splitPlace('Refinery 123', 'Efa VII - Moon 1').station).toBe('Refinery 123');
  });
  it('has no moon line when the moon is unknown', () => {
    expect(splitPlace('Brass Anvil', undefined)).toEqual({
      moon: undefined,
      station: 'Brass Anvil',
    });
  });
  it('keeps the whole name when stripping would leave nothing', () => {
    expect(splitPlace('Efa VII - Moon 1', 'Efa VII - Moon 1').station).toBe('Efa VII - Moon 1');
  });
});

describe('paymentLedger', () => {
  it('merges payments and corrections newest first, tagged by kind', () => {
    const rows = paymentLedger(
      [{ id: 'p1', at: '2026-09-02T10:00:00Z' }],
      [
        { id: 'a1', at: '2026-09-05T10:00:00Z' },
        { id: 'a0', at: '2026-08-01T10:00:00Z' },
      ]
    );
    expect(rows.map((r) => [r.kind, r.id])).toEqual([
      ['correction', 'a1'],
      ['payment', 'p1'],
      ['correction', 'a0'],
    ]);
  });
});

describe('activityFeed', () => {
  it('merges mail, dismissals and audit newest first and filters by kind', () => {
    const items = activityFeed({
      mail: [{ id: 'm', at: 3000 }],
      dismissed: [{ id: 'd', at: 5000 }],
      audit: [{ id: 'x', at: 4000 }],
    });
    expect(items.map((i) => i.kind)).toEqual(['dismissed', 'audit', 'mail']);
  });
});

describe('per Miner and moon ore lines (against the book view)', () => {
  const ORE = 45490;
  const input: BookViewInput = {
    corporationId: CORP,
    now: '2026-09-16T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-16T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [
      {
        characterId: 1,
        recordedCorporationId: CORP,
        structureId: 1001,
        date: '2026-09-16',
        oreLines: [
          { typeId: ORE, quantity: 400 },
          { typeId: ORE + 1, quantity: 200 },
        ],
      },
      {
        characterId: 2,
        recordedCorporationId: CORP,
        structureId: 1001,
        date: '2026-09-16',
        oreLines: [{ typeId: ORE, quantity: 100 }],
      },
    ],
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [
      {
        structureId: 1001,
        moonId: 7,
        extractionStartTime: '2026-09-01T10:00:00Z',
        chunkArrivalTime: '2026-09-15T10:00:00Z',
        naturalDecayTime: '2026-09-15T13:00:00Z',
        oreLines: [{ typeId: ORE, quantity: 1000 }],
      },
    ],
    paidStatementIds: new Set(),
    pricesOn: () => ({
      prices: new Map([
        [ORE, 1000],
        [ORE + 1, 3000],
      ]),
      sources: new Map(),
    }),
  };
  const view = buildBookView(input);
  const extraction = view.extractions[0];

  it('ore lines of each Miner sum to the moon page row', () => {
    const detail = extractionDetail(view, extraction.id)!;
    const rows = minersOnMoon(view, extraction.id);
    expect(rows.map((r) => r.minerId).sort()).toEqual(detail.miners.map((m) => m.minerId).sort());
    for (const m of detail.miners) {
      const row = rows.find((r) => r.minerId === m.minerId)!;
      expect(row.lines.reduce((s, l) => s + l.quantity, 0)).toBe(m.units);
      expect(row.lines.reduce((s, l) => s + l.value, 0)).toBeCloseTo(m.value, 6);
      expect(row.lines.reduce((s, l) => s + l.tax, 0)).toBeCloseTo(m.tax, 6);
      expect(row).toMatchObject({ units: m.units, tax: m.tax });
    }
  });

  it('puts a refinery on one moon row, and knows its moon for a day outside any Extraction', () => {
    const outside = buildBookView({
      ...input,
      entries: [
        ...input.entries,
        {
          characterId: 1,
          recordedCorporationId: CORP,
          structureId: 1001,
          date: '2026-08-20',
          oreLines: [{ typeId: ORE, quantity: 10 }],
        },
      ],
    });
    expect(moonByStructure(outside).get(1001)).toBe(7);
    const moons = minerMoons(outside, 'solo:1');
    expect(moons).toHaveLength(1);
    expect(moons[0]).toMatchObject({ moonId: 7, days: 2 });
  });

  it("lists a Miner's moons with their ore lines", () => {
    const moons = minerMoons(view, 'solo:1');
    expect(moons).toHaveLength(1);
    expect(moons[0]).toMatchObject({ moonId: 7, extractionId: extraction.id, days: 1 });
    expect(moons[0].lines.map((l) => l.typeId).sort()).toEqual([ORE, ORE + 1]);
  });
});

describe('day phases against the Miner row figures', () => {
  const ORE = 45490;
  const base: BookViewInput = {
    corporationId: CORP,
    now: '2026-09-16T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-16T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: ['2026-09-10', '2026-09-11', '2026-09-16', '2026-09-17'].map((date) => ({
      characterId: 1,
      recordedCorporationId: CORP,
      structureId: 1001,
      date,
      oreLines: [{ typeId: ORE, quantity: 100 }],
    })),
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [
      {
        id: 'adj1',
        minerId: 'solo:1',
        date: '2026-09-10',
        amount: 25,
        reason: 'fix',
        by: 1,
        at: '2026-09-16T13:00:00Z',
      },
    ],
    extractions: [],
    paidStatementIds: new Set(),
    pricesOn: () => ({ prices: new Map([[ORE, 1000]]), sources: new Map() }),
  };
  const sumTax = (days: readonly DayRow[]) => days.reduce((s, d) => s + d.tax, 0);

  it('the phase sums match the row figures, correction lines included', () => {
    const view = buildBookView(base);
    const row = view.miners.find((m) => m.id === 'solo:1')!;
    const phases = daysByPhase(view.internals.byMiner.get('solo:1')!.days);
    expect(phases.stillAccruing.length).toBeGreaterThan(0);
    expect(sumTax(phases.stillAccruing)).toBeCloseTo(row.pending, 6);
    const lines = view.internals.byMiner.get('solo:1')!.draft;
    const correction =
      lines.kind === 'nothing' ? 0 : lines.lines.filter((l) => !l.chargeKey).length;
    expect(correction).toBeGreaterThan(0);
    expect(
      sumTax(phases.nextStatement) + statementAdjustment(phases.nextStatement, row)
    ).toBeCloseTo(row.unbilled, 6);
    expect(statementAdjustment(phases.nextStatement, row)).toBeCloseTo(25, 6);
  });

  it('the phase sums match the row figures when ore arrives late for a billed day', () => {
    const solo = { ...base, adjustments: [], entries: [base.entries[0]] };
    const first = buildBookView(solo);
    const plan = planStatementRun(first, { start: '2026-08-01', end: '2026-09-15' });
    const statement = statementForLine(first, plan, plan.lines[0]);
    const grown = buildBookView({
      ...solo,
      statements: [statement],
      entries: [{ ...base.entries[0], oreLines: [{ typeId: ORE, quantity: 150 }] }],
    });
    const row = grown.miners.find((m) => m.id === 'solo:1')!;
    const phases = daysByPhase(grown.internals.byMiner.get('solo:1')!.days);
    expect(row.unbilled).toBeGreaterThan(0);
    // The day lists its full tax; the Statement bills only the growth.
    expect(statementAdjustment(phases.nextStatement, row)).toBeCloseTo(-10_000, 6);
  });
});
