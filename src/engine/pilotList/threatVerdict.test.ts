import { describe, expect, it } from 'vitest';
import type { KillRecord } from './killActivity';
import { needsDangerRatio, threatVerdict } from './threatVerdict';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function kill(
  agoMs: number,
  space: KillRecord['space'] = 'nullsec',
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

/** `count` kills, one per day starting `startDays` ago. */
function kills(count: number, startDays = 1, space: KillRecord['space'] = 'nullsec'): KillRecord[] {
  return Array.from({ length: count }, (_, i) => kill((startDays + i) * DAY, space));
}

describe('threatVerdict', () => {
  it('is inactive with no kill in the last 90 days, whatever the record says', () => {
    const verdict = threatVerdict({ kills: [kill(91 * DAY)], dangerRatio: 80, nowMs: NOW });
    expect(verdict.level).toBe('inactive');
    expect(verdict.recentKills).toBe(0);
  });

  it('is inactive with no kills at all', () => {
    expect(threatVerdict({ kills: [], dangerRatio: null, nowMs: NOW }).level).toBe('inactive');
  });

  it('counts a kill exactly 90 days old as recent', () => {
    expect(threatVerdict({ kills: [kill(90 * DAY)], dangerRatio: null, nowMs: NOW }).level).toBe(
      'low'
    );
  });

  it('is low below three recent kills', () => {
    expect(threatVerdict({ kills: kills(2), dangerRatio: 90, nowMs: NOW }).level).toBe('low');
  });

  it('is active from three recent kills', () => {
    expect(threatVerdict({ kills: kills(3), dangerRatio: 90, nowMs: NOW }).level).toBe('active');
  });

  it('is active at nine recent kills even with a high danger ratio', () => {
    expect(threatVerdict({ kills: kills(9), dangerRatio: 90, nowMs: NOW }).level).toBe('active');
  });

  it('is dangerous from ten recent kills and a danger ratio of 50', () => {
    expect(threatVerdict({ kills: kills(10), dangerRatio: 50, nowMs: NOW }).level).toBe(
      'dangerous'
    );
  });

  it('stays active at ten recent kills when the danger ratio is 49', () => {
    expect(threatVerdict({ kills: kills(10), dangerRatio: 49, nowMs: NOW }).level).toBe('active');
  });

  it('never reaches dangerous without a danger ratio', () => {
    const verdict = threatVerdict({ kills: kills(40), dangerRatio: null, nowMs: NOW });
    expect(verdict.level).toBe('active');
    expect(verdict.dangerKnown).toBe(false);
  });

  it('ignores kills older than 90 days when counting', () => {
    const list = [...kills(8), ...kills(5, 100)];
    const verdict = threatVerdict({ kills: list, dangerRatio: 90, nowMs: NOW });
    expect(verdict.recentKills).toBe(8);
    expect(verdict.level).toBe('active');
  });

  it('does not depend on the order of the kill list', () => {
    const list = kills(10);
    const forward = threatVerdict({ kills: list, dangerRatio: 60, nowMs: NOW });
    const backward = threatVerdict({ kills: [...list].reverse(), dangerRatio: 60, nowMs: NOW });
    expect(backward).toEqual(forward);
  });

  it('reports the newest kill, any age', () => {
    const verdict = threatVerdict({
      kills: [kill(3 * DAY), kill(100 * DAY)],
      dangerRatio: null,
      nowMs: NOW,
    });
    expect(verdict.lastKillMs).toBe(NOW - 3 * DAY);
    expect(
      threatVerdict({ kills: [kill(100 * DAY)], dangerRatio: null, nowMs: NOW }).lastKillMs
    ).toBe(NOW - 100 * DAY);
    expect(threatVerdict({ kills: [], dangerRatio: null, nowMs: NOW }).lastKillMs).toBeNull();
  });

  it('names the kind of space most recent kills happened in', () => {
    const list = [...kills(2, 1, 'lowsec'), ...kills(4, 5, 'nullsec'), kill(DAY, null)];
    expect(threatVerdict({ kills: list, dangerRatio: null, nowMs: NOW }).mainSpace).toBe('nullsec');
  });

  it('has no main space when no recent kill says where', () => {
    expect(
      threatVerdict({ kills: [kill(DAY, null)], dangerRatio: null, nowMs: NOW }).mainSpace
    ).toBe(null);
  });

  it('breaks a space tie toward the more dangerous space', () => {
    const list = [kill(DAY, 'highsec'), kill(2 * DAY, 'lowsec')];
    expect(threatVerdict({ kills: list, dangerRatio: null, nowMs: NOW }).mainSpace).toBe('lowsec');
  });

  it('measures the share of recent kills that were capsules', () => {
    const list = [
      kill(DAY, 'nullsec', { victimShipTypeId: 670 }),
      kill(2 * DAY, 'nullsec', { victimShipTypeId: 33328 }),
      kill(3 * DAY, 'nullsec', { victimShipTypeId: 587 }),
      kill(4 * DAY, 'nullsec', { victimShipTypeId: null }),
    ];
    expect(threatVerdict({ kills: list, dangerRatio: null, nowMs: NOW }).podShare).toBe(0.5);
  });

  it('has a null pod share with no recent kills', () => {
    expect(threatVerdict({ kills: [], dangerRatio: null, nowMs: NOW }).podShare).toBeNull();
  });
});

describe('needsDangerRatio', () => {
  it('is true only when the recent kill count could reach dangerous', () => {
    expect(needsDangerRatio(kills(9), NOW)).toBe(false);
    expect(needsDangerRatio(kills(10), NOW)).toBe(true);
    expect(needsDangerRatio([...kills(9), kill(95 * DAY)], NOW)).toBe(false);
  });
});
