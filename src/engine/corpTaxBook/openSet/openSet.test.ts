import { describe, expect, it } from 'vitest';
import { settleOpenSet, placeOfFactory, type OpenSet, type OpenSetInput } from '.';
import { buildBookView, type BookViewInput } from '../bookView';
import { overlayCorpBooks, type PersonalBook } from '../personal';
import type { Statement } from '../statements';
import type { SyncExtraction } from '../sync';
import type { ObservedMiningEntry } from '../types';

const CORP = 98000001;
const OWNER = 98000777;
const ORE = 45490;
const MOON = 40_000_050;
const NOW = '2026-09-18T14:00:00Z';

/** Laser fired 10 Aug: the pull runs 10-12 Aug at the default 48 h expiry. */
const PULL: SyncExtraction = {
  structureId: 1001,
  moonId: MOON,
  extractionStartTime: '2026-07-27T00:00:00Z',
  chunkArrivalTime: '2026-08-09T20:00:00Z',
  naturalDecayTime: '2026-08-09T23:00:00Z',
  laserFiredAt: '2026-08-10T01:00:00Z',
};
const PULL_ID = '1001_' + Date.parse(PULL.extractionStartTime);

/** One row; stamped rows carry the moon, as the server writes it (`placeObservedRows`). */
function row(
  characterId: number,
  date: string,
  quantity: number,
  extra: Partial<ObservedMiningEntry> = {}
): ObservedMiningEntry {
  return {
    characterId,
    recordedCorporationId: CORP,
    structureId: 1001,
    date,
    moonId: MOON,
    oreLines: [{ typeId: ORE, quantity }],
    ...extra,
  };
}

/** A Statement billing whole days at 1,000 ISK per unit and 10%. */
function statement(
  id: string,
  minerId: string,
  days: { key: string; date: string; tax: number }[],
  issuedAt = '2026-09-01T12:00:00Z'
): Statement {
  return {
    id,
    minerId,
    code: id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    coversFrom: '2026-08-01',
    coversThrough: '2026-08-31',
    issuedAt,
    hubId: 'jita',
    oreForm: 'compressed',
    lines: days.map((d) => ({
      kind: 'mined' as const,
      date: d.date,
      chargeKey: d.key,
      structureId: 1001,
      oreLines: [{ typeId: ORE, quantity: d.tax / 100 }],
      estimatedValue: d.tax * 10,
      tax: d.tax,
    })),
    amount: days.reduce((sum, d) => sum + d.tax, 0),
  };
}

const keyOf = (characterId: number, date: string) => `${characterId}:1001:${date}`;

/** The whole book an officer reads. */
function officer(over: Partial<OpenSetInput> = {}): OpenSetInput {
  return {
    corporationId: CORP,
    now: NOW,
    startDate: '2026-08-01',
    graceHours: 6,
    lastSyncedAt: '2026-09-18T12:00:00Z',
    overdueDays: 14,
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [],
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    pricesOn: () => ({
      prices: new Map([[ORE, 1000]]),
      sources: new Map([[ORE, 'saved' as const]]),
    }),
    placement: { extractions: [PULL], structureExpiryHours: {} },
    ...over,
  };
}

/** What a member reads of the same book: their own rows and records, no Extractions. */
function member(book: OpenSetInput, characterIds: readonly number[]): OpenSetInput {
  const mine = new Set(characterIds);
  const minerIds = new Set(
    book.miners.filter((m) => m.characterIds.some((c) => mine.has(c))).map((m) => m.id)
  );
  for (const c of characterIds) minerIds.add(`solo:${c}`);
  return {
    ...book,
    entries: book.entries.filter((e) => mine.has(e.characterId)),
    statements: book.statements.filter((s) => minerIds.has(s.minerId)),
    payments: book.payments.filter((p) => p.minerId !== undefined && minerIds.has(p.minerId)),
    placement: 'observed-rows',
  };
}

/** One Miner's settlement as both sides must read it (the Extraction id is officer-only). */
function settlementOf(open: OpenSet, minerId: string) {
  const s = open.miners.get(minerId);
  return {
    charges: open.charges
      .filter((c) => c.minerId === minerId)
      .map((c) => [c.key, c.moonId, c.taxOwed]),
    unrated: open.unrated.map((e) => keyOf(e.characterId, e.date)),
    unread: open.unread.map((e) => keyOf(e.characterId, e.date)),
    billableThrough: open.billableThrough,
    byStatement: s ? [...s.allocation.byStatement] : [],
    credit: s?.allocation.credit ?? 0,
    dismissalCredits: s?.dismissalCredits ?? [],
    overdue: s ? [...s.overdue].map(([id, o]) => [id, o.state, o.overdueAt]) : [],
  };
}

const donation = (id: string, minerId: string, amount: number, at = '2026-09-05T00:00:00Z') => ({
  id,
  minerId,
  characterId: Number(minerId.slice(5)) || 1,
  amount,
  at,
  source: 'donation' as const,
});

const AUG10 = keyOf(1, '2026-08-10');
const AUG11 = keyOf(1, '2026-08-11');

describe('settleOpenSet: officer and member agree', () => {
  const table: { name: string; book: OpenSetInput; minerId: string; characterIds: number[] }[] = [
    {
      name: 'unbilled days, one held for a moon owner not read since',
      book: officer({
        entries: [
          row(1, '2026-08-10', 1000),
          row(1, '2026-09-17', 2000, { sourceCorporationId: OWNER, structureId: 2002 }),
          row(2, '2026-08-10', 500),
        ],
        feeders: [{ corporationId: OWNER, lastReadWellAt: '2026-09-10T00:00:00Z' }],
      }),
      minerId: 'solo:1',
      characterIds: [1],
    },
    {
      name: 'a billed day a donation settles, the rest left as credit',
      book: officer({
        entries: [row(1, '2026-08-10', 1000)],
        statements: [statement('s1', 'solo:1', [{ key: AUG10, date: '2026-08-10', tax: 100_000 }])],
        payments: [donation('p1', 'solo:1', 150_000)],
      }),
      minerId: 'solo:1',
      characterIds: [1],
    },
    {
      name: 'a moon dismissal crediting a billed day of that moon',
      book: officer({
        entries: [row(1, '2026-08-10', 1000), row(1, '2026-08-11', 1000)],
        statements: [
          statement('s1', 'solo:1', [
            { key: AUG10, date: '2026-08-10', tax: 100_000 },
            { key: AUG11, date: '2026-08-11', tax: 100_000 },
          ]),
        ],
        dismissals: [
          {
            id: 'd1',
            scope: 'moon',
            targetId: String(MOON),
            by: 9,
            at: '2026-09-03T00:00:00Z',
            reason: 'fleet op',
          },
        ],
      }),
      minerId: 'solo:1',
      characterIds: [1],
    },
    {
      name: 'an unpaid Statement past its Overdue days, one paused by a declaration',
      book: officer({
        entries: [row(1, '2026-08-10', 1000), row(1, '2026-08-11', 1000)],
        statements: [
          statement('s1', 'solo:1', [{ key: AUG10, date: '2026-08-10', tax: 100_000 }]),
          statement(
            's2',
            'solo:1',
            [{ key: AUG11, date: '2026-08-11', tax: 100_000 }],
            '2026-08-20T00:00:00Z'
          ),
        ],
        declarations: [
          { id: 'x1', statementId: 's1', kind: 'contract', at: '2026-09-15T00:00:00Z' },
        ],
      }),
      minerId: 'solo:1',
      characterIds: [1],
    },
    {
      name: 'a record dismissal on an absorbed Miner’s billed day after a regroup',
      book: officer({
        entries: [row(2, '2026-08-10', 1000)],
        miners: [{ id: 'solo:1', characterIds: [1, 2], mainCharacterId: 1 }],
        statements: [
          statement('s2', 'solo:2', [
            { key: keyOf(2, '2026-08-10'), date: '2026-08-10', tax: 100_000 },
          ]),
        ],
        dismissals: [
          {
            id: 'd2',
            scope: 'record',
            targetId: keyOf(2, '2026-08-10'),
            by: 9,
            at: '2026-09-03T00:00:00Z',
            reason: 'wrong refinery',
          },
        ],
      }),
      minerId: 'solo:2',
      characterIds: [1, 2],
    },
  ];

  it.each(table)('$name', ({ book, minerId, characterIds }) => {
    const theirs = settleOpenSet(book);
    const mine = settleOpenSet(member(book, characterIds));
    expect(settlementOf(mine, minerId)).toEqual(settlementOf(theirs, minerId));
  });

  it('places a day on its Extraction for the officer, and on the row’s moon only for a member', () => {
    const book = officer({ entries: [row(1, '2026-08-10', 1000)] });
    expect(settleOpenSet(book).charges[0]).toMatchObject({ moonId: MOON, extractionId: PULL_ID });
    const own = settleOpenSet(member(book, [1])).charges[0];
    expect(own.moonId).toBe(MOON);
    // Extractions are officer-only (firestore.rules): a member's rows carry no Extraction id.
    expect(own.extractionId).toBeUndefined();
  });

  it('places by the structure’s own expiry, not the 48 h default', () => {
    const placeOf = placeOfFactory([PULL], { '1001': 96 });
    expect(placeOf(1001, '2026-08-14')).toEqual({ moonId: MOON, extractionId: PULL_ID });
    expect(placeOfFactory([PULL], {})(1001, '2026-08-14')).toEqual({});
  });

  it('holds a Miner’s billable-through before the first day a stale moon owner holds', () => {
    const open = settleOpenSet(
      officer({
        entries: [
          row(1, '2026-08-10', 1000),
          row(1, '2026-09-12', 1000, { sourceCorporationId: OWNER, structureId: 2002 }),
        ],
        feeders: [{ corporationId: OWNER, lastReadWellAt: '2026-09-10T00:00:00Z' }],
      })
    );
    expect(open.billableThrough).toBe('2026-09-17');
    expect(open.miners.get('solo:1')).toMatchObject({
      billableThrough: '2026-09-08',
      hold: { from: '2026-09-09', ownerCorporationId: OWNER },
    });
  });
});

describe('the callers read one settlement', () => {
  /** The regroup row above, through the officer's view and the member's overlay. */
  const regrouped = {
    entries: [row(2, '2026-08-10', 1000)],
    miners: [{ id: 'solo:1', characterIds: [1, 2], mainCharacterId: 1 }],
    statements: [
      statement('s2', 'solo:2', [
        { key: keyOf(2, '2026-08-10'), date: '2026-08-10', tax: 100_000 },
      ]),
    ],
    dismissals: [
      {
        id: 'd2',
        scope: 'record' as const,
        targetId: keyOf(2, '2026-08-10'),
        by: 9,
        at: '2026-09-03T00:00:00Z',
        reason: 'wrong refinery',
      },
    ],
  };

  it('settles a dismissed day of an absorbed Miner’s Statement for the officer and the member alike', () => {
    const base = officer();
    const view = buildBookView({
      ...(base as unknown as BookViewInput),
      minimumStatement: 0,
      cadence: { kind: 'monthly' },
      hubId: 'jita',
      oreForm: 'compressed',
      structureExpiryHours: {},
      adjustments: [],
      extractions: [PULL],
      paidStatementIds: new Set(),
      graceHours: 6,
      overdueDays: 14,
      declarations: [],
      ...regrouped,
    });
    const officerOwes = view.miners.find((m) => m.id === 'solo:2')?.owed ?? 0;

    const personal: PersonalBook = {
      corporationId: CORP,
      corpName: 'Brass Meridian Logistics',
      characterIds: [1, 2],
      startDate: base.startDate,
      graceHours: 6,
      lastSyncedAt: base.lastSyncedAt!,
      rates: [...base.rates],
      hubId: 'jita',
      oreForm: 'compressed',
      payments: [],
      inFlight: [],
      pricesOn: base.pricesOn,
      ...regrouped,
      observed: regrouped.entries,
    };
    const [summary] = overlayCorpBooks({ entries: [], books: [personal], now: NOW }).books;
    const memberOwes = summary.openStatements.length > 0;

    expect(officerOwes > 0).toBe(memberOwes);
    expect(officerOwes).toBe(0);
  });
});
