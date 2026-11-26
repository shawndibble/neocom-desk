import { describe, expect, it } from 'vitest';
import {
  FEEDER_DISCONNECT_DAYS,
  advanceFeederHealth,
  daysUntilOreLost,
  oreLostOn,
  disconnectedCoverage,
  splitByCoverageAndRead,
  withholdUnreadFeederDays,
  type FeederHealth,
  heldBillableThrough,
  staleOwnerHolds,
} from './feederHealth';
import type { ObservedMiningEntry } from './types';
import type { CoveragePeriod } from './coverage';

const NOW = '2026-10-20T12:00:00.000Z';

describe('advanceFeederHealth', () => {
  it('a good read records when, and clears any staleness', () => {
    const prev: FeederHealth = {
      status: 'active',
      lastReadWellAt: '2026-10-01T00:00:00.000Z',
      staleSince: '2026-10-05T00:00:00.000Z',
    };
    expect(advanceFeederHealth(prev, 'ok', NOW)).toEqual({ status: 'active', lastReadWellAt: NOW });
  });

  it('the first bad read marks the feeder stale from now', () => {
    const prev: FeederHealth = { status: 'active', lastReadWellAt: '2026-10-19T00:00:00.000Z' };
    expect(advanceFeederHealth(prev, 'stale', NOW)).toEqual({
      status: 'active',
      lastReadWellAt: '2026-10-19T00:00:00.000Z',
      staleSince: NOW,
    });
  });

  it('later bad reads keep the original stale date', () => {
    const prev: FeederHealth = {
      status: 'active',
      lastReadWellAt: '2026-10-01T00:00:00.000Z',
      staleSince: '2026-10-05T00:00:00.000Z',
    };
    expect(advanceFeederHealth(prev, 'stale', NOW).staleSince).toBe('2026-10-05T00:00:00.000Z');
  });

  it('stays active just short of 30 days stale', () => {
    expect(FEEDER_DISCONNECT_DAYS).toBe(30);
    const prev: FeederHealth = { status: 'active', staleSince: '2026-09-21T12:00:01.000Z' };
    expect(advanceFeederHealth(prev, 'stale', NOW).status).toBe('active');
  });

  it('disconnects at 30 days stale', () => {
    const prev: FeederHealth = { status: 'active', staleSince: '2026-09-20T12:00:00.000Z' };
    expect(advanceFeederHealth(prev, 'stale', NOW).status).toBe('disconnected');
  });

  it('disconnects on the clock alone: an unreadable run is not needed', () => {
    const prev: FeederHealth = { status: 'active', staleSince: '2026-09-01T00:00:00.000Z' };
    expect(advanceFeederHealth(prev, 'none', NOW).status).toBe('disconnected');
  });

  it('a read that could not be tried changes nothing while inside the window', () => {
    const prev: FeederHealth = { status: 'active', lastReadWellAt: '2026-10-19T00:00:00.000Z' };
    expect(advanceFeederHealth(prev, 'none', NOW)).toEqual(prev);
  });

  it('a disconnected feeder stays disconnected', () => {
    const prev: FeederHealth = { status: 'disconnected', staleSince: '2026-08-01T00:00:00.000Z' };
    expect(advanceFeederHealth(prev, 'ok', NOW)).toBe(prev);
  });
});

describe('disconnectedCoverage', () => {
  it('ends coverage on the last fully synced day', () => {
    expect(
      disconnectedCoverage([{ from: '2026-08-01' }], { lastReadWellAt: '2026-09-10T08:00:00.000Z' })
    ).toEqual([{ from: '2026-08-01', to: '2026-09-09' }]);
  });

  it('keeps earlier closed periods untouched', () => {
    expect(
      disconnectedCoverage([{ from: '2026-01-01', to: '2026-02-01' }, { from: '2026-08-01' }], {
        lastReadWellAt: '2026-09-10T08:00:00.000Z',
      })
    ).toEqual([
      { from: '2026-01-01', to: '2026-02-01' },
      { from: '2026-08-01', to: '2026-09-09' },
    ]);
  });

  it('a read before the grace ended does not fully sync that day', () => {
    expect(
      disconnectedCoverage([{ from: '2026-08-01' }], { lastReadWellAt: '2026-09-10T00:10:00.000Z' })
    ).toEqual([{ from: '2026-08-01', to: '2026-09-08' }]);
  });

  it('a feeder never read well covered nothing', () => {
    expect(disconnectedCoverage([{ from: '2026-08-01' }], {})).toEqual([]);
  });

  it('honours the book grace', () => {
    expect(
      disconnectedCoverage(
        [{ from: '2026-08-01' }],
        { lastReadWellAt: '2026-09-10T08:00:00.000Z' },
        12
      )
    ).toEqual([{ from: '2026-08-01', to: '2026-09-08' }]);
  });
});

const entry = (characterId: number, date: string, source?: number): ObservedMiningEntry =>
  ({
    characterId,
    recordedCorporationId: 1,
    date,
    refineryId: 1,
    oreLines: [],
    ...(source !== undefined ? { sourceCorporationId: source } : {}),
  }) as unknown as ObservedMiningEntry;

describe('withholdUnreadFeederDays', () => {
  const clock = { now: NOW, graceHours: 6 };

  it('leaves the book’s own rows alone', () => {
    const own = [entry(1, '2026-10-10'), entry(1, '2026-10-11', 99)];
    expect(withholdUnreadFeederDays(own, { ...clock, bookCorporationId: 99, feeders: [] })).toEqual(
      own
    );
  });

  it('keeps a feeder day read after its grace', () => {
    const rows = [entry(1, '2026-10-10', 7)];
    const feeders = [{ corporationId: 7, lastReadWellAt: '2026-10-20T00:00:00.000Z' }];
    expect(withholdUnreadFeederDays(rows, { ...clock, bookCorporationId: 99, feeders })).toEqual(
      rows
    );
  });

  it('withholds feeder days no read has followed since the grace', () => {
    const rows = [entry(1, '2026-10-10', 7), entry(1, '2026-10-18', 7)];
    const feeders = [{ corporationId: 7, lastReadWellAt: '2026-10-12T00:00:00.000Z' }];
    expect(
      withholdUnreadFeederDays(rows, { ...clock, bookCorporationId: 99, feeders }).map(
        (e) => e.date
      )
    ).toEqual(['2026-10-10']);
  });

  it('withholds the miner’s whole day, so no one is billed off a partial day', () => {
    const rows = [
      entry(1, '2026-10-18', 7),
      entry(1, '2026-10-18'),
      entry(2, '2026-10-18'),
      entry(1, '2026-10-10'),
    ];
    const feeders = [{ corporationId: 7, lastReadWellAt: '2026-10-12T00:00:00.000Z' }];
    expect(
      withholdUnreadFeederDays(rows, { ...clock, bookCorporationId: 99, feeders }).map(
        (e) => `${e.characterId}:${e.date}`
      )
    ).toEqual(['2:2026-10-18', '1:2026-10-10']);
  });

  it('a feeder never read well has nothing Billable', () => {
    const rows = [entry(1, '2026-10-10', 7)];
    expect(
      withholdUnreadFeederDays(rows, {
        ...clock,
        bookCorporationId: 99,
        feeders: [{ corporationId: 7 }],
      })
    ).toEqual([]);
  });

  it('one stale feeder does not hold another feeder’s days', () => {
    const rows = [entry(1, '2026-10-18', 7), entry(2, '2026-10-18', 8)];
    const feeders = [
      { corporationId: 7 },
      { corporationId: 8, lastReadWellAt: '2026-10-20T00:00:00.000Z' },
    ];
    expect(
      withholdUnreadFeederDays(rows, { ...clock, bookCorporationId: 99, feeders }).map(
        (e) => e.characterId
      )
    ).toEqual([2]);
  });
});

describe('splitByCoverageAndRead', () => {
  it('splits rows into readable, unread (held by a read) and outside coverage', () => {
    const outside = entry(1, '2026-09-01', 7);
    const read = entry(1, '2026-10-10', 7);
    const notRead = entry(2, '2026-10-18', 7);
    const sameDay = entry(2, '2026-10-18');
    const own = entry(3, '2026-10-18');
    const feeders = [
      {
        corporationId: 7,
        coveragePeriods: [{ from: '2026-10-01' }],
        lastReadWellAt: '2026-10-12T00:00:00.000Z',
      },
    ];
    const split = splitByCoverageAndRead([outside, read, notRead, sameDay, own], {
      now: NOW,
      graceHours: 6,
      bookCorporationId: 99,
      feeders,
    });
    expect(split.outsideCoverage).toEqual([outside]);
    expect(split.readable).toEqual([read, own]);
    expect(split.unread).toEqual([notRead, sameDay]);
  });
});

describe('heldBillableThrough (#6209)', () => {
  const held = new Map([
    [1, { from: '2026-08-20' }],
    [2, { from: '2026-08-25' }],
  ]);
  it('stops a miner the day before its earliest held day', () => {
    expect(heldBillableThrough('2026-09-17', [1], held)).toBe('2026-08-19');
    expect(heldBillableThrough('2026-09-17', [2, 1], held)).toBe('2026-08-19');
  });
  it('leaves a miner with no held day, or held after it, as it is', () => {
    expect(heldBillableThrough('2026-09-17', [3], held)).toBe('2026-09-17');
    expect(heldBillableThrough('2026-08-10', [1], held)).toBe('2026-08-10');
    expect(heldBillableThrough(undefined, [1], held)).toBeUndefined();
  });
});

describe('staleOwnerHolds (#6209)', () => {
  const OWNER = 98000002;
  const row = (characterId: number, date: string, source?: number) =>
    ({
      characterId,
      date,
      ...(source !== undefined ? { sourceCorporationId: source } : {}),
    }) as const;
  const clock = (
    lastReadWellAt: string | undefined,
    coveragePeriods: CoveragePeriod[] = [{ from: '2026-08-01' }]
  ) => ({
    now: '2026-09-18T14:00:00Z',
    graceHours: 6,
    bookCorporationId: 1,
    feeders: [
      { corporationId: OWNER, coveragePeriods, ...(lastReadWellAt ? { lastReadWellAt } : {}) },
    ],
  });
  const rows = [row(1, '2026-08-10', OWNER), row(2, '2026-08-12'), row(3, '2026-08-20', OWNER)];

  it("holds every miner who mines at a stale owner's refineries from its first unread day", () => {
    const hold = { from: '2026-08-15', ownerCorporationId: OWNER };
    expect(staleOwnerHolds(rows, clock('2026-08-15T10:00:00Z'), '2026-09-17')).toEqual(
      new Map([
        [1, hold],
        [3, hold],
      ])
    );
  });
  it('holds nothing for an owner read up to date, or whose coverage ended before it went stale', () => {
    expect(staleOwnerHolds(rows, clock('2026-09-18T10:00:00Z'), '2026-09-17').size).toBe(0);
    const ended = clock('2026-08-15T10:00:00Z', [{ from: '2026-08-01', to: '2026-08-14' }]);
    expect(staleOwnerHolds(rows, ended, '2026-09-17').size).toBe(0);
  });
  it('an owner never read well holds from its first covered day', () => {
    expect(staleOwnerHolds(rows, clock(undefined), '2026-09-17').get(1)?.from).toBe('2026-08-01');
  });
});

describe('daysUntilOreLost', () => {
  it('counts down from the first unread day: EVE keeps 30 days of ledger', () => {
    const health = {
      lastReadWellAt: '2026-10-10T12:00:00.000Z',
      staleSince: '2026-10-11T00:00:00.000Z',
    };
    expect(daysUntilOreLost(health, '2026-10-20T12:00:00.000Z')).toBe(21);
    expect(daysUntilOreLost(health, '2026-11-09T01:00:00.000Z')).toBe(1);
    expect(daysUntilOreLost(health, '2026-11-10T01:00:00.000Z')).toBe(0);
    expect(daysUntilOreLost(health, '2026-12-01T01:00:00.000Z')).toBe(0);
    expect(oreLostOn(health)).toBe('2026-11-10');
  });

  it('never read well: counts from the day it went stale', () => {
    expect(daysUntilOreLost({ staleSince: '2026-10-11T08:00:00.000Z' }, NOW)).toBe(22);
  });
});
