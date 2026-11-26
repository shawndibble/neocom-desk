export interface RunSizing {
  runs: number;
  unitsMade: number;
  spare: number;
}

export function sizeRuns(needed: number, outputPerRun: number): RunSizing | null {
  if (outputPerRun <= 0) return null;
  const runs = Math.max(1, Math.ceil(needed / outputPerRun));
  const unitsMade = runs * outputPerRun;
  return { runs, unitsMade, spare: unitsMade - needed };
}
