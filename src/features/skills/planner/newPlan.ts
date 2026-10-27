import type { SkillPlanRecord } from '@/db';

/** A fresh, empty plan record. Own module (not exported from PlanListPane.tsx) so sharing it doesn't break that component's Fast Refresh. */
export function newPlan(characterId: number, name: string, remapCount = 0): SkillPlanRecord {
  return {
    id: crypto.randomUUID(),
    characterId,
    name,
    entries: [],
    remapCount,
    updatedAt: Date.now(),
  };
}
