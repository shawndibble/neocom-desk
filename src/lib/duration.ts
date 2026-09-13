/**
 * Format a duration (seconds) as "Xd Yh Zm", dropping leading zero units.
 * Shared by the Industry (job timers) and Skills Planner (training queue)
 * features — was two byte-identical copies.
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

/**
 * Format a live countdown (seconds), one unit coarser than `formatDuration`
 * once there is a day on the clock: "4d 4h", not "4d 4h 19m".
 *
 * A countdown with days left is read as "roughly when", never "exactly when" —
 * the minutes place is three digits of precision nobody acts on, and it is
 * what pushed the board's hero cells past the width two of them can share on a
 * phone. Under a day the minutes are the answer, so they stay.
 *
 * The hours place survives a `0`, so a cell that reads "1d 4h" today does not
 * become "1d" tomorrow and look like a different kind of value. Truncating,
 * never rounding, keeps the countdown from reading earlier than it is.
 */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 86_400) return formatDuration(seconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return `${days}d ${hours}h`;
}

/**
 * Wall-clock finish for a scheduled step, derived from the same
 * `cumulativeSeconds` the training-time column already shows — never
 * re-derived a second way, so the two can't disagree.
 */
export function stepFinish(cumulativeSeconds: number, startDate: Date): Date {
  return new Date(startDate.getTime() + cumulativeSeconds * 1000);
}
