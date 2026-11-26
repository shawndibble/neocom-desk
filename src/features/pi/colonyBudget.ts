import { loadCorrectedSkills } from '@/features/skills/correctedSkills';

export const COMMAND_CENTER_UPGRADES_SKILL_ID = 2505;

export { colonyBudget, maxColonyBudget, type MaxColonyBudget } from './colonyBudgetModel';

export async function loadCommandCenterUpgrades(
  characterId: number,
  nowMs: number
): Promise<number | null> {
  const corrected = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  if (!corrected.skillsResult) return null;
  return corrected.effective.get(COMMAND_CENTER_UPGRADES_SKILL_ID) ?? 0;
}
