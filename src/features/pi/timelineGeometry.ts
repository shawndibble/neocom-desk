/**
 * Where an extractor program's bar sits in the timeline's track.
 *
 * Display geometry, not domain maths — it answers "how wide is this bar",
 * which is why it lives beside the component rather than in `engine/pi`. It is
 * its own module only because `ExtractorTimeline.tsx` may export components
 * and nothing else (`react-refresh/only-export-components`); keeping it
 * separate also lets the clamp and the expired-stub rule be tested directly,
 * without rendering anything.
 */

const DAY_MS = 86_400_000;

/**
 * The track's far edge, as time from now.
 *
 * 14 days because that is the longest program EVE will install, so the clamp
 * below is an edge guard rather than the common case. A shorter window would
 * flatten every program past it into an identical full-width bar — and those
 * are precisely the ones a player is trying to rank against each other when
 * deciding what can wait until next week.
 */
export const TIMELINE_WINDOW_MS = 14 * DAY_MS;

export interface BarGeometry {
  leftPercent: number;
  widthPercent: number;
  /** The program outruns the window, so its bar is capped rather than overflowing. */
  capped: boolean;
}

/**
 * A program's bar as percentages of the window.
 *
 * The track is *remaining* time, so an expired program gets width 0 — drawn as
 * a stub at the now-edge by the bar's `min-w`, never as a bar running leftward
 * into the past, which reads as "still running" at a glance. A program longer
 * than the window caps at 100% instead of overflowing its track.
 */
export function programBarGeometry(
  expiryMs: number,
  nowMs: number,
  windowMs: number = TIMELINE_WINDOW_MS
): BarGeometry {
  const remainingMs = expiryMs - nowMs;
  if (remainingMs <= 0) return { leftPercent: 0, widthPercent: 0, capped: false };
  const raw = (remainingMs / windowMs) * 100;
  return { leftPercent: 0, widthPercent: Math.min(raw, 100), capped: raw > 100 };
}
