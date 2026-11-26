export function effectiveSkillLevel(trainedLevel: number, activeLevel: number): number {
  return Math.min(trainedLevel, activeLevel);
}
