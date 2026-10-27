/**
 * The Overview Route safety widget's arithmetic: a saved route's player kills
 * over the last 24 hours, as kills per hour and per system.
 *
 * States conditions, never verdicts (decision `20260912-172628`): a system is
 * "quiet", has "some kills" or is "busy", and a system whose kills could not
 * be read is unknown, never zero.
 *
 * Pure, per CLAUDE.md: the caller supplies the kill times (epoch ms).
 */
import { HOUR_MS } from '@/lib/age';

export const KILL_WINDOW_HOURS = 24;

/** Player kills in 24 hours at which a system reads "busy". */
export const BUSY_KILLS = 5;

export type KillLevel = 'quiet' | 'some' | 'busy';

/** Kills per hour, oldest first: the last entry is the hour ending at `now`. */
export function hourlyKillCounts(
  times: readonly number[],
  now: number,
  hours: number = KILL_WINDOW_HOURS
): number[] {
  const counts = new Array<number>(hours).fill(0);
  for (const time of times) {
    const age = now - time;
    if (age < 0 || age >= hours * HOUR_MS) continue;
    counts[hours - 1 - Math.floor(age / HOUR_MS)]! += 1;
  }
  return counts;
}

export function killLevel(kills: number): KillLevel {
  if (kills === 0) return 'quiet';
  return kills >= BUSY_KILLS ? 'busy' : 'some';
}

export interface RouteKillSystem {
  systemId: number;
  name: string;
  /** Kill times in epoch ms; `null` when they could not be read. */
  kills: readonly number[] | null;
}

export interface RouteKillRow {
  systemId: number;
  name: string;
  /** `null` is unknown, never zero. */
  count: number | null;
  level: KillLevel | null;
}

export interface RouteKillSummary {
  /** Most kills first; systems that could not be read last, in route order. */
  rows: RouteKillRow[];
  busy: number;
  /** Systems whose kills were read. */
  known: number;
  unknown: number;
  total: number;
  /** Kills per hour over the systems that were read; `null` when none were. */
  hourly: number[] | null;
}

export function summarizeRouteKills(
  systems: readonly RouteKillSystem[],
  now: number
): RouteKillSummary {
  const rows: RouteKillRow[] = systems.map((system) => {
    const kills = system.kills;
    const inWindow =
      kills === null
        ? null
        : kills.filter((time) => now - time >= 0 && now - time < KILL_WINDOW_HOURS * HOUR_MS);
    return {
      systemId: system.systemId,
      name: system.name,
      count: inWindow === null ? null : inWindow.length,
      level: inWindow === null ? null : killLevel(inWindow.length),
    };
  });
  const read = systems.flatMap((system) => (system.kills === null ? [] : [system.kills]));
  const ranked = [...rows].sort((a, b) => (b.count ?? -1) - (a.count ?? -1));
  return {
    rows: ranked,
    busy: rows.filter((row) => row.level === 'busy').length,
    known: read.length,
    unknown: systems.length - read.length,
    total: rows.reduce((sum, row) => sum + (row.count ?? 0), 0),
    hourly: read.length === 0 ? null : hourlyKillCounts(read.flat(), now),
  };
}
