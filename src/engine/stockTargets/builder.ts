export function runsToCover(shortfall: number, unitsPerRun: number): number {
  const perRun = unitsPerRun > 0 ? unitsPerRun : 1;
  return Math.max(1, Math.ceil(shortfall / perRun));
}

export function timePerRunAtTe(baseSeconds: number, timeEfficiency: number): number {
  return Math.round(baseSeconds * (1 - timeEfficiency / 100));
}
