import { describe, expect, it } from 'vitest';
import { ageTone, monthlyBySpace, summarizeKills, topShips, type KillRecord } from './killActivity';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function kill(
  agoMs: number,
  space: KillRecord['space'],
  extra: Partial<KillRecord> = {}
): KillRecord {
  return {
    timeMs: NOW - agoMs,
    space,
    systemId: 1,
    victimShipTypeId: 10,
    ownShipTypeId: 20,
    ...extra,
  };
}

describe('summarizeKills', () => {
  it('counts the last 30 days per space and dates the latest kill in each', () => {
    const result = summarizeKills(
      [
        kill(2 * HOUR, 'nullsec'),
        kill(3 * DAY, 'nullsec'),
        kill(5 * DAY, 'lowsec'),
        kill(40 * DAY, 'highsec'),
      ],
      NOW
    );
    expect(result.bySpace.nullsec).toEqual({ count: 2, lastMs: NOW - 2 * HOUR });
    expect(result.bySpace.lowsec).toEqual({ count: 1, lastMs: NOW - 5 * DAY });
    // Older than the window: not counted, but the date still says how stale it is.
    expect(result.bySpace.highsec).toEqual({ count: 0, lastMs: NOW - 40 * DAY });
    expect(result.bySpace.wormhole).toEqual({ count: 0, lastMs: null });
    expect(result.recentCount).toBe(3);
  });

  it('leaves a kill with no space out of the per-space counts but in the total', () => {
    const result = summarizeKills([kill(HOUR, null)], NOW);
    expect(result.recentCount).toBe(1);
    expect(result.bySpace.nullsec.count).toBe(0);
  });

  it('reports no kills at all as an empty summary', () => {
    expect(summarizeKills([], NOW).recentCount).toBe(0);
  });
});

describe('ageTone', () => {
  it('fades with age: today, this week, older', () => {
    expect(ageTone(NOW - 2 * HOUR, NOW)).toBe('fresh');
    expect(ageTone(NOW - 3 * DAY, NOW)).toBe('week');
    expect(ageTone(NOW - 8 * DAY, NOW)).toBe('old');
    expect(ageTone(null, NOW)).toBe('none');
  });
});

describe('monthlyBySpace', () => {
  it('lists the last six calendar months oldest first, counting kills per space', () => {
    const months = monthlyBySpace(
      [kill(1 * DAY, 'nullsec'), kill(1 * DAY, 'nullsec'), kill(20 * DAY, 'lowsec')],
      NOW
    );
    expect(months).toHaveLength(6);
    expect(months[5]).toMatchObject({ key: '2026-10', nullsec: 2 });
    expect(months[4]).toMatchObject({ key: '2026-09', lowsec: 1 });
    expect(months[0].key).toBe('2026-05');
  });

  it('drops kills older than the six months', () => {
    const months = monthlyBySpace([kill(400 * DAY, 'nullsec')], NOW);
    expect(months.every((m) => m.nullsec === 0)).toBe(true);
  });
});

describe('topShips', () => {
  it('ranks hulls by count, skipping unknowns, and caps the list', () => {
    expect(topShips([5, 5, null, 7, 7, 7, 9], 2)).toEqual([
      { shipTypeId: 7, count: 3 },
      { shipTypeId: 5, count: 2 },
    ]);
  });
});
