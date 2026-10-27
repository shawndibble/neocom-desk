import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_PLAN_TICKS_KEY = 'piPlanTicks';

/**
 * The Plan tab's ticked rows (quick wins, in-game steps): per device, keyed by
 * the model's stable row ids, which carry the colony. The page prunes ids whose
 * row is gone (`pruneTicks`), so a win that comes back starts unticked.
 */
export function parsePlanTicks(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((id): id is string => typeof id === 'string');
}

export const usePlanTicks = createLocalSetting<string[]>({
  key: PI_PLAN_TICKS_KEY,
  defaultValue: [],
  parse: parsePlanTicks,
});

export const PI_PLAN_PREFERENCE_KEY = 'piPlanPreference';

export const usePlanPreference = createLocalSetting<'isk' | 'haul'>({
  key: PI_PLAN_PREFERENCE_KEY,
  defaultValue: 'isk',
  parse: (raw) => (raw === 'isk' || raw === 'haul' ? raw : null),
});
