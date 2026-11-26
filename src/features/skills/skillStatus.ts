export type SkillTrainingStatus = 'trained' | 'partial' | 'missing';

export function skillTrainingStatus(
  currentLevel: number,
  targetLevel: number
): SkillTrainingStatus {
  if (currentLevel >= targetLevel) return 'trained';
  return currentLevel === 0 ? 'missing' : 'partial';
}
