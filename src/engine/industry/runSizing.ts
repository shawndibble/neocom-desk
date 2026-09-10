/**
 * How many job runs cover a needed quantity, when a recipe yields
 * `outputPerRun` units per run. EVE installs jobs in whole runs, never a
 * fraction of one, so covering `needed` units almost always makes more than
 * `needed` — the same "runs, not units" sizing `subBuild.ts`, `makeOrBuy.ts`
 * and `autoMakeOrBuy.ts` each used to hand-type on their own.
 */

export interface RunSizing {
  /** Runs to install. At least 1 — a job can't be sized to zero runs. */
  runs: number;
  /** runs x outputPerRun. */
  unitsMade: number;
  /** unitsMade - needed. Non-zero whenever the output does not divide evenly. */
  spare: number;
}

/** `null` when the recipe yields nothing per run — nothing to size. */
export function sizeRuns(needed: number, outputPerRun: number): RunSizing | null {
  if (outputPerRun <= 0) return null;
  const runs = Math.max(1, Math.ceil(needed / outputPerRun));
  const unitsMade = runs * outputPerRun;
  return { runs, unitsMade, spare: unitsMade - needed };
}
