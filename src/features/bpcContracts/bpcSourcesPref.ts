import { createLocalSetting } from '@/lib/useLocalSetting';
import {
  DEFAULT_SOURCE_TOGGLES,
  SOURCE_TOGGLES,
  type SourceToggle,
} from '@/features/bpcContracts/bpcSourcingUrl';

export const BPC_SOURCES_SETTING_KEY = 'bpcSourcingSources';

function isSourceToggle(raw: unknown): raw is SourceToggle {
  return typeof raw === 'string' && (SOURCE_TOGGLES as readonly string[]).includes(raw);
}

export const useBpcSources = createLocalSetting<readonly SourceToggle[]>({
  key: BPC_SOURCES_SETTING_KEY,
  defaultValue: DEFAULT_SOURCE_TOGGLES,
  parse: (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.every(isSourceToggle) ? (raw as SourceToggle[]) : null;
  },
});
