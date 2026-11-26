import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

const SYNCED_TARGET_SKILL_PLAN_KEY = 'sync.targetSkillPlan';

export type TargetSkillPlanByCharacter = Record<number, string>;

export function parseTargetSkillPlans(raw: unknown): TargetSkillPlanByCharacter {
  return (
    parseCharacterKeyedRecord<string>(raw, (value) => (typeof value === 'string' ? value : null)) ??
    {}
  );
}

export function targetPlanIdFor(
  value: TargetSkillPlanByCharacter,
  characterId: number
): string | undefined {
  return value[characterId];
}

export function withTargetPlanId(
  value: TargetSkillPlanByCharacter,
  characterId: number,
  planId: string
): TargetSkillPlanByCharacter {
  return { ...value, [characterId]: planId };
}

export function selectTargetPlanId(
  plans: readonly { id: string }[],
  storedPlanId: string | undefined
): string | null {
  if (plans.length === 0) return null;
  if (plans.length === 1) return plans[0].id;
  const stored = plans.find((p) => p.id === storedPlanId);
  return (stored ?? plans[0]).id;
}

export const useTargetSkillPlans = createSyncedSetting<TargetSkillPlanByCharacter>({
  key: SYNCED_TARGET_SKILL_PLAN_KEY,
  defaultValue: {},
  parse: parseTargetSkillPlans,
});
