import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_WINDOW_MS,
  EMPTY_ORE_ARRIVAL_LOG,
  arrivalNotice,
  isInArrivalWindow,
  recordLedgerFetch,
  uncheckedSince,
  type OreArrivalLog,
} from './oreArrival';

const MIN = 60_000;
const at = (iso: string) => Date.parse(iso);
const CHAR = 91;
const SYSTEM = 30000142;

function fetchOf(quantity: number, date = '2026-10-04') {
  return [{ date, solarSystemId: SYSTEM, quantity }];
}
const settled = (date = '2026-10-04') => [{ characterId: CHAR, date, solarSystemId: SYSTEM }];

describe('isInArrivalWindow', () => {
  it("holds for today's EVE day", () => {
    expect(isInArrivalWindow('2026-10-04', at('2026-10-04T18:00:00Z'))).toBe(true);
  });

  it("holds for yesterday only within the hour after midnight UTC, ESI's longest lag", () => {
    expect(isInArrivalWindow('2026-10-03', at('2026-10-04T00:59:00Z'))).toBe(true);
    expect(isInArrivalWindow('2026-10-03', at('2026-10-04T01:00:00Z'))).toBe(false);
  });

  it('never holds for an older day', () => {
    expect(isInArrivalWindow('2026-10-01', at('2026-10-04T00:10:00Z'))).toBe(false);
  });
});

describe('recordLedgerFetch', () => {
  it('takes a first fetch as a baseline: nothing to compare, so no growth is known', () => {
    const log = recordLedgerFetch(
      EMPTY_ORE_ARRIVAL_LOG,
      CHAR,
      fetchOf(100),
      at('2026-10-04T12:00:00Z')
    );
    expect(arrivalNotice(settled(), log, at('2026-10-04T12:05:00Z'))).toEqual({ kind: 'quiet' });
  });

  it('marks an entry whose quantity grew since the last fetch', () => {
    let log = recordLedgerFetch(
      EMPTY_ORE_ARRIVAL_LOG,
      CHAR,
      fetchOf(100),
      at('2026-10-04T12:00:00Z')
    );
    log = recordLedgerFetch(log, CHAR, fetchOf(150), at('2026-10-04T12:10:00Z'));
    expect(arrivalNotice(settled(), log, at('2026-10-04T12:22:00Z'))).toEqual({
      kind: 'arriving',
      arriving: 1,
      of: 1,
      waitMs: 48 * MIN,
    });
  });

  it('keeps the time of the last growth through fetches that changed nothing', () => {
    let log = recordLedgerFetch(
      EMPTY_ORE_ARRIVAL_LOG,
      CHAR,
      fetchOf(100),
      at('2026-10-04T12:00:00Z')
    );
    log = recordLedgerFetch(log, CHAR, fetchOf(150), at('2026-10-04T12:10:00Z'));
    log = recordLedgerFetch(log, CHAR, fetchOf(150), at('2026-10-04T12:20:00Z'));
    const notice = arrivalNotice(settled(), log, at('2026-10-04T12:30:00Z'));
    expect(notice).toMatchObject({ kind: 'arriving', waitMs: 40 * MIN });
  });

  it('counts an entry that first appears in a later fetch of the same day as growth', () => {
    let log = recordLedgerFetch(EMPTY_ORE_ARRIVAL_LOG, CHAR, [], at('2026-10-04T12:00:00Z'));
    log = recordLedgerFetch(log, CHAR, fetchOf(40), at('2026-10-04T12:10:00Z'));
    expect(arrivalNotice(settled(), log, at('2026-10-04T12:10:00Z'))).toMatchObject({
      kind: 'arriving',
    });
  });

  it("does not count a new entry as growth when the last fetch was before that entry's day began", () => {
    let log = recordLedgerFetch(EMPTY_ORE_ARRIVAL_LOG, CHAR, [], at('2026-10-03T23:00:00Z'));
    log = recordLedgerFetch(log, CHAR, fetchOf(40), at('2026-10-04T09:00:00Z'));
    expect(arrivalNotice(settled(), log, at('2026-10-04T09:05:00Z'))).toEqual({ kind: 'quiet' });
  });

  it('ignores a fetch no newer than the last one recorded — the same cached response served again', () => {
    let log = recordLedgerFetch(
      EMPTY_ORE_ARRIVAL_LOG,
      CHAR,
      fetchOf(100),
      at('2026-10-04T12:00:00Z')
    );
    log = recordLedgerFetch(log, CHAR, fetchOf(150), at('2026-10-04T12:00:00Z'));
    expect(arrivalNotice(settled(), log, at('2026-10-04T12:05:00Z'))).toEqual({ kind: 'quiet' });
  });

  it('forgets entries once they can no longer grow', () => {
    let log = recordLedgerFetch(
      EMPTY_ORE_ARRIVAL_LOG,
      CHAR,
      fetchOf(100, '2026-10-01'),
      at('2026-10-01T12:00:00Z')
    );
    log = recordLedgerFetch(log, CHAR, [], at('2026-10-04T12:00:00Z'));
    expect(Object.keys(log.entries)).toEqual([]);
  });

  it("leaves other characters' entries alone", () => {
    let log = recordLedgerFetch(EMPTY_ORE_ARRIVAL_LOG, 7, fetchOf(5), at('2026-10-04T12:00:00Z'));
    log = recordLedgerFetch(log, CHAR, fetchOf(100), at('2026-10-04T12:01:00Z'));
    expect(Object.keys(log.entries)).toHaveLength(2);
  });
});

describe('arrivalNotice', () => {
  function growing(): OreArrivalLog {
    let log = recordLedgerFetch(
      EMPTY_ORE_ARRIVAL_LOG,
      CHAR,
      fetchOf(100),
      at('2026-10-04T12:00:00Z')
    );
    log = recordLedgerFetch(log, CHAR, fetchOf(150), at('2026-10-04T12:10:00Z'));
    return log;
  }

  it('says nothing about entries from a day that can no longer grow', () => {
    expect(arrivalNotice(settled('2026-09-30'), growing(), at('2026-10-04T12:20:00Z'))).toEqual({
      kind: 'none',
    });
  });

  it('drops to quiet an hour after the last growth', () => {
    expect(arrivalNotice(settled(), growing(), at('2026-10-04T13:10:00Z'))).toEqual({
      kind: 'quiet',
    });
  });

  it('is quiet for an entry in the window the app has never fetched', () => {
    expect(arrivalNotice(settled(), EMPTY_ORE_ARRIVAL_LOG, at('2026-10-04T12:20:00Z'))).toEqual({
      kind: 'quiet',
    });
  });

  it('counts an entry settled as several Assignments once', () => {
    expect(
      arrivalNotice([...settled(), ...settled()], growing(), at('2026-10-04T12:20:00Z'))
    ).toMatchObject({ kind: 'arriving', arriving: 1, of: 1 });
  });

  it('counts how many of the entries that can still grow are growing, and waits for the latest', () => {
    const other = { characterId: CHAR, date: '2026-10-04', solarSystemId: 1 };
    let log = recordLedgerFetch(
      EMPTY_ORE_ARRIVAL_LOG,
      CHAR,
      [...fetchOf(100), { date: '2026-10-04', solarSystemId: 1, quantity: 10 }],
      at('2026-10-04T12:00:00Z')
    );
    log = recordLedgerFetch(
      log,
      CHAR,
      [...fetchOf(150), { date: '2026-10-04', solarSystemId: 1, quantity: 10 }],
      at('2026-10-04T12:10:00Z')
    );
    expect(
      arrivalNotice(
        [...settled(), other, ...settled('2026-09-01')],
        log,
        at('2026-10-04T12:20:00Z')
      )
    ).toEqual({ kind: 'arriving', arriving: 1, of: 2, waitMs: ARRIVAL_WINDOW_MS - 10 * MIN });
  });
});

describe('uncheckedSince', () => {
  it("is true when an in-window entry's character has not been fetched since then", () => {
    const log = recordLedgerFetch(
      EMPTY_ORE_ARRIVAL_LOG,
      CHAR,
      fetchOf(100),
      at('2026-10-04T12:00:00Z')
    );
    expect(
      uncheckedSince(settled(), log, at('2026-10-04T12:05:00Z'), at('2026-10-04T12:06:00Z'))
    ).toBe(true);
    expect(
      uncheckedSince(settled(), log, at('2026-10-04T11:59:00Z'), at('2026-10-04T12:06:00Z'))
    ).toBe(false);
  });

  it('ignores entries outside the window', () => {
    expect(
      uncheckedSince(settled('2026-09-01'), EMPTY_ORE_ARRIVAL_LOG, 0, at('2026-10-04T12:06:00Z'))
    ).toBe(false);
  });
});
