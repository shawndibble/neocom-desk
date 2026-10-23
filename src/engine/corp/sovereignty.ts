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
