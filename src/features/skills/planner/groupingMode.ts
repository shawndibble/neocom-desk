/**
 * Skill Plan editor's entry-list grouping control (#115): whether band
 * headers group runs of entries by priority (default) or by primary/secondary
 * attribute pair. Purely a view preference, like columnPreference.ts's
 * "Columns" control — a device-local setting applying the same way across
 * every plan on this device rather than per-plan. Never changes what's
 * persisted on the plan itself.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const GROUPING_MODE_SETTING_KEY = 'planGroupingMode';

export type GroupingMode = 'priority' | 'attributePair';

export const GROUPING_MODES: readonly GroupingMode[] = ['priority', 'attributePair'];

export const DEFAULT_GROUPING_MODE: GroupingMode = 'priority';

export function isGroupingMode(raw: unknown): raw is GroupingMode {
  return raw === 'priority' || raw === 'attributePair';
}

export const useGroupingMode = createLocalSetting<GroupingMode>({
  key: GROUPING_MODE_SETTING_KEY,
  defaultValue: DEFAULT_GROUPING_MODE,
  parse: (raw) => (isGroupingMode(raw) ? raw : null),
});
