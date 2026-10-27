/**
 * Skill Plan editor's "Columns" control (#114): which optional row parts
 * (attribute-pair badge, priority, per-level time, cumulative time) render,
 * persisted under the plain (non-`sync.`-prefixed) key 'planColumnVisibility'
 * — a device-local view preference like Market's `locationMode.ts`, applying
 * the same way across every plan on this device rather than per-plan.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

/**
 * Versioned key. The stored shape is unchanged, so a device that already has
 * `planColumnVisibility` would replay its old value — including the priority
 * column this now leaves off — and never see the new defaults. Bumping the
 * key retires that row and lets every device read the defaults once; anyone
 * who wants priority back turns it on in "Columns", and that choice sticks.
 */
export const COLUMN_VISIBILITY_SETTING_KEY = 'planColumnVisibility.v2';

export interface ColumnVisibility {
  attributePair: boolean;
  priority: boolean;
  perLevelTime: boolean;
  cumulativeTime: boolean;
}

/**
 * Priority is off by default: it is an editing control, not a reading one, and
 * a per-row control on every row read as the loudest thing in a list whose job
 * is to be scanned. The other three are readouts, so they stay on — including
 * the finish date, which replaced both a running-total duration and a separate
 * start/finish line, so the default row now shows fewer numbers than before.
 */
export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  attributePair: true,
  priority: false,
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
