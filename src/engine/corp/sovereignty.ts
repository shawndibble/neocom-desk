/**
 * Sovereignty raid windows (issue #4775): pure maths over a skyhook's theft
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
