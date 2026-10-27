import { describe, expect, it } from 'vitest';
import {
  allianceSpace,
  hubReagentsRunOutMs,
  closingSoon,
  liveRaids,
  nearRaids,
  raidHeadline,
  raidState,
} from './sovereignty';

const HOUR = 3_600_000;
const NOW = 1_000 * HOUR;
const at = (ms: number) => NOW + ms;

describe('raidState', () => {
  it('is upcoming before the window opens', () => {
    expect(raidState({ startMs: at(HOUR), endMs: at(3 * HOUR) }, NOW)).toBe('upcoming');
  });
  it('is open from the start until the end', () => {
    expect(raidState({ startMs: NOW, endMs: at(HOUR) }, NOW)).toBe('open');
  });
  it('is closed at the end', () => {
    expect(raidState({ startMs: at(-2 * HOUR), endMs: NOW }, NOW)).toBe('closed');
  });
  it('keeps a hub past its end in overtime, still vulnerable', () => {
    expect(raidState({ startMs: at(-2 * HOUR), endMs: at(-HOUR) }, NOW, 'hub')).toBe('overtime');
  });
  it('still closes a skyhook past its end', () => {
    expect(raidState({ startMs: at(-2 * HOUR), endMs: at(-HOUR) }, NOW, 'skyhook')).toBe('closed');
  });
});

describe('raidHeadline', () => {
  it('counts windows not yet closed and times the soonest opening', () => {
    expect(
      raidHeadline(
        [
          { startMs: at(6 * HOUR), endMs: at(8 * HOUR) },
          { startMs: at(9 * HOUR), endMs: at(11 * HOUR) },
          { startMs: at(-5 * HOUR), endMs: at(-HOUR) },
        ],
        NOW
      )
    ).toEqual({ count: 2, untilMs: 6 * HOUR });
  });
  it('says 0 until when a window is already open', () => {
    expect(raidHeadline([{ startMs: at(-HOUR), endMs: at(HOUR) }], NOW)).toEqual({
      count: 1,
      untilMs: 0,
    });
  });
  it('is empty when nothing is left to raid', () => {
    expect(raidHeadline([], NOW)).toEqual({ count: 0, untilMs: null });
  });
  it('counts only windows open or opening within the horizon, still timing the soonest', () => {
    expect(
      raidHeadline(
        [
          { startMs: at(-HOUR), endMs: at(HOUR) },
          { startMs: at(5 * HOUR), endMs: at(7 * HOUR) },
          { startMs: at(30 * HOUR), endMs: at(32 * HOUR) },
        ],
        NOW,
        6 * HOUR
      )
    ).toEqual({ count: 2, untilMs: 0 });
    expect(raidHeadline([{ startMs: at(30 * HOUR), endMs: at(32 * HOUR) }], NOW, 6 * HOUR)).toEqual(
      { count: 0, untilMs: 30 * HOUR }
    );
  });
});

describe('hubReagentsRunOutMs', () => {
  it('is when the bay empties at its burn rate, from its last update', () => {
    expect(hubReagentsRunOutMs({ amount: 100, burningPerHour: 10, updatedMs: at(-2 * HOUR) })).toBe(
      at(8 * HOUR)
    );
  });
  it('is unknown when nothing burns', () => {
    expect(hubReagentsRunOutMs({ amount: 10, burningPerHour: 0, updatedMs: NOW })).toBeNull();
  });
});

describe('allianceSpace', () => {
  it('is the systems whose claim is the alliance, and no other', () => {
    expect(
      allianceSpace(
        [
          { systemId: 1, allianceId: 99 },
          { systemId: 2, allianceId: 77 },
          { systemId: 3, allianceId: null },
          { systemId: 4, allianceId: 99 },
        ],
        99
      )
    ).toEqual(new Set([1, 4]));
  });
  it('is empty for an alliance holding no sov', () => {
    expect(allianceSpace([{ systemId: 2, allianceId: 77 }], 99).size).toBe(0);
  });
});

describe('liveRaids', () => {
  const hook = (key: string, startH: number, endH: number) => ({
    key,
    window: { startMs: at(startH * HOUR), endMs: at(endH * HOUR) },
  });

  it('puts open windows first, closing soonest, then upcoming by opening', () => {
    const order = liveRaids(
      [hook('later', 2, 6), hook('openLong', -1, 3), hook('soon', 1, 5), hook('openShort', -2, 1)],
      NOW
    ).map((r) => r.key);
    expect(order).toEqual(['openShort', 'openLong', 'soon', 'later']);
  });
  it('drops closed and unread windows', () => {
    expect(
      liveRaids([hook('closed', -3, -1), { key: 'unread', window: null }, hook('open', -1, 1)], NOW)
    ).toEqual([hook('open', -1, 1)]);
  });
  it('breaks a tie on the key, so the order never shuffles', () => {
    expect(liveRaids([hook('b', 1, 3), hook('a', 1, 3)], NOW).map((r) => r.key)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('closingSoon', () => {
  it('is true for an open window with under ten minutes left', () => {
    expect(closingSoon({ startMs: at(-HOUR), endMs: at(9 * 60_000) }, NOW)).toBe(true);
  });
  it('is false at ten minutes, with longer left, before opening, and once closed', () => {
    expect(closingSoon({ startMs: at(-HOUR), endMs: at(10 * 60_000) }, NOW)).toBe(false);
    expect(closingSoon({ startMs: at(-HOUR), endMs: at(HOUR) }, NOW)).toBe(false);
    expect(closingSoon({ startMs: at(60_000), endMs: at(5 * 60_000) }, NOW)).toBe(false);
    expect(closingSoon({ startMs: at(-HOUR), endMs: NOW }, NOW)).toBe(false);
  });
});

describe('nearRaids', () => {
  const hook = (key: string, startH: number, endH: number, systemId = 1) => ({
    key,
    systemId,
    window: { startMs: at(startH * HOUR), endMs: at(endH * HOUR) } as {
      startMs: number;
      endMs: number;
    } | null,
  });
  const jumps = new Map([
    [1, 3],
    [2, 9],
    [3, 2],
    [4, 6],
  ]);

  it('cuts at the radius and counts what the cut left out', () => {
    const near = nearRaids(
      [hook('a', -1, 1, 1), hook('far', -1, 1, 2), hook('c', 1, 3, 3)],
      jumps,
      8,
      NOW
    );
    expect(near.within.map((h) => h.key)).toEqual(['a', 'c']);
    expect(near.beyond).toBe(1);
  });
  it('keeps a hook exactly at the radius', () => {
    expect(nearRaids([hook('far', -1, 1, 2)], jumps, 9, NOW).within).toHaveLength(1);
  });
  it('lists open first by fewer jumps, then upcoming by opening, ties by fewer jumps', () => {
    const order = nearRaids(
      [
        hook('upLate', 3, 5, 3),
        hook('upSoonFar', 1, 3, 4),
        hook('upSoonNear', 1, 3, 3),
        hook('openFar', -1, 1, 4),
        hook('openNear', -2, 1, 3),
      ],
      jumps,
      8,
      NOW
    ).within.map((h) => h.key);
    expect(order).toEqual(['openNear', 'openFar', 'upSoonNear', 'upSoonFar', 'upLate']);
  });
  it('drops closed windows, keeps unread ones last, and ignores systems with no known distance', () => {
    const near = nearRaids(
      [
        hook('closed', -3, -1, 1),
        { ...hook('unread', 0, 0, 1), window: null },
        hook('up', 1, 2, 3),
        hook('lost', 1, 2, 99),
      ],
      jumps,
      8,
      NOW
    );
    expect(near.within.map((h) => h.key)).toEqual(['up', 'unread']);
    expect(near.beyond).toBe(0);
  });
  it('does not count a closed window beyond the radius', () => {
    expect(nearRaids([hook('closedFar', -3, -1, 2)], jumps, 8, NOW).beyond).toBe(0);
  });
});
