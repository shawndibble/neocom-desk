/**
 * The Builder view's figures for a short item the pilot holds a blueprint for.
 */

/** Runs of a blueprint that make at least `shortfall` units, never fewer than one. */
export function runsToCover(shortfall: number, unitsPerRun: number): number {
  const perRun = unitsPerRun > 0 ? unitsPerRun : 1;
  return Math.max(1, Math.ceil(shortfall / perRun));
}

/**
 * Seconds per run after the blueprint's own time efficiency. Before skills,
 * implants and facility, which the Build Plan applies once one is made: this
 * is the figure to compare blueprints by, not a job's duration.
 */
export function timePerRunAtTe(baseSeconds: number, timeEfficiency: number): number {
  return Math.round(baseSeconds * (1 - timeEfficiency / 100));
}
