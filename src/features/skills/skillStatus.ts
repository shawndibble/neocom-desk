/**
 * The 3-state read shared by Fit Check's rows (`ships/fitCheckRows.ts`) and
 * Market's item-detail Required Skills section: trained to the requested
 * level already, partially trained (some levels in, more still needed), or
 * never started at all.
 */
export type SkillTrainingStatus = 'trained' | 'partial' | 'missing';

export function skillTrainingStatus(
  currentLevel: number,
  targetLevel: number
): SkillTrainingStatus {
  if (currentLevel >= targetLevel) return 'trained';
  return currentLevel === 0 ? 'missing' : 'partial';
}
