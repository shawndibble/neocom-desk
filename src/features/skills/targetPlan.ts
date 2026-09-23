/**
 * Which Skill Plan an Add-to-Plan action lands on, per Character. One
 * synced blob keyed by Character id, same reason as `sync.skillCloneStates`
 * (exact-match allow-list). Pure here; the Dexie plan read lives in
 * `useTargetPlan.ts`.
 */
import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_TARGET_SKILL_PLAN_KEY = 'sync.targetSkillPlan';

export type TargetSkillPlanByCharacter = Record<number, string>;

/** The stored blob with anything but a plan-id string dropped. */
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

/**
 * Which plan an Add lands on: `null` with none (caller offers "Create Plan &
 * Add"), the only one with exactly one, else the stored id if it still names
 * one of them — otherwise the first (stale/never-set stored id).
 */
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
