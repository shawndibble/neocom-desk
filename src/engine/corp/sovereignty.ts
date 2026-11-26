import { MINUTE_MS, HOUR_MS } from '@/lib/age';

export interface RaidWindow {
  startMs: number;
  endMs: number;
}

export type SovereigntyKind = 'skyhook' | 'hub';

export type RaidState = 'upcoming' | 'open' | 'overtime' | 'closed';

export function raidState(
  window: RaidWindow,
  nowMs: number,
  kind: SovereigntyKind = 'skyhook'
): RaidState {
  if (window.endMs <= nowMs) return kind === 'hub' ? 'overtime' : 'closed';
  return window.startMs <= nowMs ? 'open' : 'upcoming';
}

export function raidHeadline(
  windows: readonly RaidWindow[],
  nowMs: number,
  horizonMs = Infinity
): { count: number; untilMs: number | null } {
  const live = windows.filter((window) => raidState(window, nowMs) !== 'closed');
  if (live.length === 0) return { count: 0, untilMs: null };
  const soonest = Math.min(...live.map((window) => window.startMs));
  return {
    count: live.filter((window) => window.startMs <= nowMs + horizonMs).length,
    untilMs: Math.max(0, soonest - nowMs),
  };
}

export function allianceSpace(
  systems: readonly { systemId: number; allianceId: number | null }[],
  allianceId: number
): Set<number> {
  return new Set(
    systems.filter((system) => system.allianceId === allianceId).map((system) => system.systemId)
  );
}

export function liveRaids<T extends { key: string; window: RaidWindow | null }>(
  skyhooks: readonly T[],
  nowMs: number
): (T & { window: RaidWindow })[] {
  const live = skyhooks.filter(
    (s): s is T & { window: RaidWindow } =>
      s.window !== null && raidState(s.window, nowMs) !== 'closed'
  );
  const rank = (window: RaidWindow) =>
    raidState(window, nowMs) === 'open' ? [0, window.endMs] : [1, window.startMs];
  return live.sort((a, b) => {
    const [ra, ta] = rank(a.window);
    const [rb, tb] = rank(b.window);
    return ra - rb || ta - tb || a.key.localeCompare(b.key);
  });
}

export const THEFT_LINK_MS = 10 * MINUTE_MS;

export function closingSoon(window: RaidWindow, nowMs: number): boolean {
  return raidState(window, nowMs) === 'open' && window.endMs - nowMs < THEFT_LINK_MS;
}

export function nearRaids<T extends { key: string; systemId: number; window: RaidWindow | null }>(
  skyhooks: readonly T[],
  jumps: ReadonlyMap<number, number>,
  radius: number,
  nowMs: number
): { within: T[]; beyond: number } {
  const within: T[] = [];
  let beyond = 0;
  for (const hook of skyhooks) {
    const away = jumps.get(hook.systemId);
    if (away === undefined) continue;
    if (hook.window !== null && raidState(hook.window, nowMs) === 'closed') continue;
    if (away > radius) beyond += 1;
    else within.push(hook);
  }
  const rank = (hook: T): [number, number, number] => {
    const away = jumps.get(hook.systemId)!;
    if (hook.window === null) return [2, 0, away];
    return raidState(hook.window, nowMs) === 'open' ? [0, 0, away] : [1, hook.window.startMs, away];
  };
  within.sort((a, b) => {
    const [ra, ta, ja] = rank(a);
    const [rb, tb, jb] = rank(b);
    return ra - rb || ta - tb || ja - jb || a.key.localeCompare(b.key);
  });
  return { within, beyond };
}

export function hubReagentsRunOutMs(bay: {
  amount: number;
  burningPerHour: number;
  updatedMs: number;
}): number | null {
  if (bay.burningPerHour <= 0) return null;
  return bay.updatedMs + (bay.amount / bay.burningPerHour) * HOUR_MS;
}
