import { describe, expect, it } from 'vitest';
import {
  BUSY_KILLS,
  hourlyKillCounts,
  killLevel,
  KILL_WINDOW_HOURS,
  summarizeRouteKills,
} from './routeKillTrend';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);

describe('hourlyKillCounts', () => {
  it('buckets kill times into the last 24 hours, oldest first, the newest hour last', () => {
    const counts = hourlyKillCounts(
      [NOW - 1, NOW - HOUR + 1, NOW - HOUR - 1, NOW - 23 * HOUR],
      NOW
    );
    expect(counts).toHaveLength(KILL_WINDOW_HOURS);
    expect(counts[23]).toBe(2);
    expect(counts[22]).toBe(1);
    expect(counts[0]).toBe(1);
  });

  it('drops kills older than the window or in the future', () => {
    const counts = hourlyKillCounts([NOW - 24 * HOUR - 1, NOW + 5], NOW);
    expect(counts.every((n) => n === 0)).toBe(true);
  });
});

describe('killLevel', () => {
  it('names the condition, never a verdict', () => {
    expect(killLevel(0)).toBe('quiet');
    expect(killLevel(1)).toBe('some');
    expect(killLevel(BUSY_KILLS - 1)).toBe('some');
    expect(killLevel(BUSY_KILLS)).toBe('busy');
  });
});

describe('summarizeRouteKills', () => {
  const systems = [
    { systemId: 1, name: 'Jita', kills: [NOW - 10, NOW - 20, NOW - 30, NOW - 40, NOW - 50] },
    { systemId: 2, name: 'Perimeter', kills: [] },
    { systemId: 3, name: 'Niarja', kills: [NOW - 2 * HOUR] },
    { systemId: 4, name: 'Unread', kills: null },
  ];

  it('counts busy systems, ranks rows by kills and keeps unknown apart from zero', () => {
    const summary = summarizeRouteKills(systems, NOW);
    expect(summary.busy).toBe(1);
    expect(summary.known).toBe(3);
    expect(summary.unknown).toBe(1);
    expect(summary.total).toBe(6);
    expect(summary.rows.map((r) => [r.name, r.count, r.level])).toEqual([
      ['Jita', 5, 'busy'],
      ['Niarja', 1, 'some'],
      ['Perimeter', 0, 'quiet'],
      ['Unread', null, null],
    ]);
  });

  it('sums the hourly kills over the systems that were read', () => {
    const summary = summarizeRouteKills(systems, NOW);
    expect(summary.hourly?.[23]).toBe(5);
    expect(summary.hourly?.[21]).toBe(1);
    expect(summary.hourly?.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('has no hourly series and no busy figure when nothing was read', () => {
    const summary = summarizeRouteKills([{ systemId: 4, name: 'Unread', kills: null }], NOW);
    expect(summary.hourly).toBeNull();
    expect(summary.known).toBe(0);
  });
});
