import type { SkillPlanRecord } from '@/db';

/**
 * A fresh, empty plan record. Split out of `PlanListPane.tsx` (which
 * originated it) so `useTargetPlan.ts`'s "Create Plan & Add" path can share
 * it without that component file exporting a non-component and breaking
 * Fast Refresh.
 */
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
