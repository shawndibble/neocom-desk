import { describe, expect, it } from 'vitest';
import {
  FEEDER_DISCONNECT_DAYS,
  advanceFeederHealth,
  disconnectedCoverage,
  withholdUnreadFeederDays,
  type FeederHealth,
} from './feederHealth';
import type { ObservedMiningEntry } from './types';

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
    // read well 2026-09-10T08:00 → 2026-09-09 closed (06:00 on the 10th) and was read after it.
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
      disconnectedCoverage([{ from: '2026-08-01' }], { lastReadWellAt: '2026-09-10T05:00:00.000Z' })
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
