import { createLocalSetting } from '@/lib/useLocalSetting';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';

export const SPACE_FILTER_SETTING_KEY = 'bpcSearchSpaceFilter';

export const DEFAULT_SPACE_FILTER: readonly SpaceKind[] = SPACE_KINDS;

function isSpaceKind(raw: unknown): raw is SpaceKind {
  return typeof raw === 'string' && (SPACE_KINDS as readonly string[]).includes(raw);
}

export const useSpaceFilter = createLocalSetting<readonly SpaceKind[]>({
  key: SPACE_FILTER_SETTING_KEY,
  defaultValue: DEFAULT_SPACE_FILTER,
  parse: (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.every(isSpaceKind) ? (raw as SpaceKind[]) : null;
  },
});
