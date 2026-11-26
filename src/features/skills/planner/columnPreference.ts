import { createLocalSetting } from '@/lib/useLocalSetting';

export const COLUMN_VISIBILITY_SETTING_KEY = 'planColumnVisibility.v2';

export interface ColumnVisibility {
  attributePair: boolean;
  priority: boolean;
  perLevelTime: boolean;
  cumulativeTime: boolean;
}

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
