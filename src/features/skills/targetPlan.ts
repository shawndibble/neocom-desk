/**
 * Which Skill Plan an "Add to Plan" action (Fit Check, the Market item-detail
 * skill chip) lands on, per Character.
 *
 * Synced, one blob keyed by Character id, for the same reason as
 * `sync.skillCloneStates`: the allow-list matches exact keys only, and this
 * is one key carrying every Character's choice rather than one key per
 * Character. Never deleted: a stale entry (its plan removed on another
 * device) is not an error — `selectTargetPlanId` below just falls back to
 * picking for itself.
 *
 * Pure here; the Dexie read of the Character's actual plans lives in
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
 * Resolves which plan an Add action should land on, given the Character's
 * current plans and whatever this preference last stored for them.
 *
 * - No plans at all: `null` — the caller offers "Create Plan & Add" instead.
 * - Exactly one plan: always that one, whatever is stored — nothing to pick.
 * - Several plans: the stored id, if it still names one of them; otherwise
 *   the first (a stored id can go stale when its plan was deleted on another
 *   device, or nothing has ever been stored for this Character yet).
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
