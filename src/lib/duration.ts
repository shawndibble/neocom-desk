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
 * Wall-clock finish for a scheduled step, derived from the same
 * `cumulativeSeconds` the training-time column already shows — never
 * re-derived a second way, so the two can't disagree.
 */
export function stepFinish(cumulativeSeconds: number, startDate: Date): Date {
  return new Date(startDate.getTime() + cumulativeSeconds * 1000);
}
