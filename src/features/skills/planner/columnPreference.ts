/**
 * Skill Plan editor's "Columns" control (#114): which optional row parts
 * (attribute-pair badge, priority, per-level time, cumulative time) render,
 * persisted under the plain (non-`sync.`-prefixed) key 'planColumnVisibility'
 * — a device-local view preference like Market's `locationMode.ts`, applying
 * the same way across every plan on this device rather than per-plan.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const COLUMN_VISIBILITY_SETTING_KEY = 'planColumnVisibility';

export interface ColumnVisibility {
  attributePair: boolean;
  priority: boolean;
  perLevelTime: boolean;
  cumulativeTime: boolean;
}

export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  attributePair: true,
  priority: true,
  perLevelTime: true,
  cumulativeTime: true,
};

export function isColumnVisibility(raw: unknown): raw is ColumnVisibility {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.attributePair === 'boolean' &&
    typeof r.priority === 'boolean' &&
    typeof r.perLevelTime === 'boolean' &&
    typeof r.cumulativeTime === 'boolean'
  );
}

export const useColumnVisibility = createLocalSetting<ColumnVisibility>({
  key: COLUMN_VISIBILITY_SETTING_KEY,
  defaultValue: DEFAULT_COLUMN_VISIBILITY,
  parse: (raw) => (isColumnVisibility(raw) ? raw : null),
});
