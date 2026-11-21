import { describe, expect, it } from 'vitest';
import { settleOpenSet, placeOfFactory, type OpenSet, type OpenSetInput } from '.';
import type { SyncExtraction } from '../sync';
import type { ObservedMiningEntry } from '../types';
import type { OreDispute } from '../disputes';

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

const keyOf = (characterId: number, date: string) => `${characterId}:1001:${date}`;

/** The whole book an officer reads. */
function officer(over: Partial<OpenSetInput> = {}): OpenSetInput {
  return {
    corporationId: CORP,
    now: NOW,
    startDate: '2026-08-01',
    graceHours: 6,
    lastSyncedAt: '2026-09-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [],
    miners: [],
    notices: [],
    payments: [],
    dismissals: [],
    pricesOn: () => ({
      prices: new Map([[ORE, 1000]]),
      sources: new Map([[ORE, 'saved' as const]]),
    }),
    placement: { kind: 'extractions', extractions: [PULL], structureExpiryHours: {} },
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
    notices: book.notices.filter((n) => minerIds.has(n.minerId)),
    payments: book.payments.filter((p) => p.minerId !== undefined && minerIds.has(p.minerId)),
    placement: { kind: 'observed-rows' },
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
    byDay: s ? [...s.account.byDay] : [],
    owes: s?.account.owes ?? null,
    credit: s?.account.credit ?? 0,
    paidThrough: s?.account.paidThrough ?? null,
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

describe('settleOpenSet: officer and member agree', () => {
  const table: { name: string; book: OpenSetInput; minerId: string; characterIds: number[] }[] = [
    {
      name: 'days, one held for a moon owner not read since',
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
      name: 'a donation that pays the oldest day and leaves credit',
      book: officer({
        entries: [row(1, '2026-08-10', 1000)],
        payments: [donation('p1', 'solo:1', 150_000)],
      }),
      minerId: 'solo:1',
      characterIds: [1],
    },
    {
      name: 'a moon dismissal that takes the moon’s days off the account',
      book: officer({
        entries: [row(1, '2026-08-10', 1000), row(1, '2026-08-11', 1000)],
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
      name: 'a record dismissal on an absorbed Miner’s day after a regroup',
      book: officer({
        entries: [row(2, '2026-08-10', 1000)],
        miners: [{ id: 'solo:1', characterIds: [1, 2], mainCharacterId: 1 }],
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
      minerId: 'solo:1',
      characterIds: [1, 2],
    },
  ];

  it.each(table)('$name', ({ book, minerId, characterIds }) => {
    const theirs = settleOpenSet(book);
    const mine = settleOpenSet(member(book, characterIds));
    expect(settlementOf(mine, minerId)).toEqual(settlementOf(theirs, minerId));
  });

  it('waives a snapshot’s held day by what dismissing its dispute credited', () => {
    const held = '2026-06-20';
    // Adjustments dated on or before `through` are in the snapshot already: the waiver
    // `dismissDispute` writes on the held day is counted once (from the dispute), the other never.
    const adjustment = (id: string, date: string, amount: number) => ({
      id,
      minerId: 'solo:1',
      date,
      amount,
      reason: 'r',
      by: 9,
      at: '2026-09-12T00:00:00Z',
    });
    const book = (resolution?: OreDispute['resolution']) =>
      officer({
        miners: [{ id: 'solo:1', characterIds: [1], mainCharacterId: 1 }],
        adjustments: [
          adjustment('a-old', '2026-06-10', -50_000),
          ...(resolution?.kind === 'dismissed'
            ? [adjustment('a-waiver', held, -resolution.amountIsk)]
            : []),
        ],
        checkpoints: new Map([
          [
            'solo:1',
            {
              minerId: 'solo:1',
              through: '2026-06-30',
              owed: [{ date: held, remaining: 100_000, tax: 100_000, credited: 0, held: true }],
              credit: 0,
              balance: 0,
              paidThrough: '2026-06-30',
              characterIds: [1],
              at: '2026-09-01T00:00:00Z',
            },
          ],
        ]),
        disputes: [
          {
            id: `solo:1_${held}`,
            minerId: 'solo:1',
            date: held,
            lines: [{ recordKey: keyOf(1, held), typeId: ORE, quantity: 1000, payeeName: 'Them' }],
            by: 1,
            at: '2026-09-10T00:00:00Z',
            ...(resolution ? { resolution } : {}),
          },
        ],
      });
    const account = (b: OpenSetInput) => settleOpenSet(b).miners.get('solo:1')!.account;
    expect(account(book()).day(held)?.held).toBe(true);
    const at = '2026-09-12T00:00:00Z';
    expect(account(book({ kind: 'rejected', at, by: 9, reason: 'no' })).owes?.amount).toBe(100_000);
    const waived = account(
      book({ kind: 'dismissed', at, by: 9, reason: 'fair', amountIsk: 100_000 })
    );
    expect(waived.day(held)).toMatchObject({ held: false, settled: true });
    expect(waived.owes).toBeNull();
    const part = account(book({ kind: 'dismissed', at, by: 9, reason: 'rate', amountIsk: 40_000 }));
    expect(part.day(held)?.remaining).toBe(60_000);
    expect(part.owes?.amount).toBe(60_000);
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
