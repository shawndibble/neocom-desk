/**
 * Sovereignty raid windows (issues #4775, #4798): pure maths over a skyhook's theft
 * window or a sov hub's vulnerability window, plus how long a hub's reagent
 * bay lasts. Epoch ms in, plain values out.
 */

export interface RaidWindow {
  startMs: number;
  endMs: number;
}

export type SovereigntyKind = 'skyhook' | 'hub';

/** `overtime`: a hub past its window end, which ESI still counts as vulnerable. */
export type RaidState = 'upcoming' | 'open' | 'overtime' | 'closed';

export function raidState(
  window: RaidWindow,
  nowMs: number,
  kind: SovereigntyKind = 'skyhook'
): RaidState {
  if (window.endMs <= nowMs) return kind === 'hub' ? 'overtime' : 'closed';
  return window.startMs <= nowMs ? 'open' : 'upcoming';
}

/**
 * "N raidable within the horizon": windows open now or opening within
 * `horizonMs`, and the wait for the soonest live one to open (0 when one is
 * open now), even past the horizon. `untilMs` is null when none is left.
 */
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

/** The systems `allianceId` holds sov in, from the public claims list. */
export function allianceSpace(
  systems: readonly { systemId: number; allianceId: number | null }[],
  allianceId: number
): Set<number> {
  return new Set(
    systems.filter((system) => system.allianceId === allianceId).map((system) => system.systemId)
  );
}

/**
 * Skyhooks whose theft window is open or still ahead, soonest first: open
 * windows closing soonest, then upcoming ones by when they open. A closed or
 * unread window drops out; ties fall back to the key, so the order is stable.
 */
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

/** The theft link takes ten minutes, so a window with less than this left is closing. */
export const THEFT_LINK_MS = 10 * 60_000;

/** An open window with under `THEFT_LINK_MS` left. */
export function closingSoon(window: RaidWindow, nowMs: number): boolean {
  return raidState(window, nowMs) === 'open' && window.endMs - nowMs < THEFT_LINK_MS;
}

/**
 * The raidable skyhooks a hunter can act on: live ones within `radius` jumps
 * (a system with no known distance is left out, nothing guessed), open first
 * by fewer jumps, then upcoming by opening and then fewer jumps. A hook with no
 * readable window stays, last. `beyond` counts live hooks the radius cut.
 */
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

/**
 * When a hub's reagent bay empties: `last_updated` plus the amount at the burn
 * rate. Epoch ms; may be in the past. Null when nothing burns.
 */
export function hubReagentsRunOutMs(bay: {
  amount: number;
  burningPerHour: number;
  updatedMs: number;
}): number | null {
  if (bay.burningPerHour <= 0) return null;
  return bay.updatedMs + (bay.amount / bay.burningPerHour) * 3_600_000;
}
