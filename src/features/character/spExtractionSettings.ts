import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { SP_EXTRACTION_CHUNK_SP } from '@/engine/skills/spExtraction';
import {
  isCharacterStarred,
  parseStarredCharacters,
  withToggledStar,
} from '@/features/character/starredCharacters';

export const SP_EXTRACTION_ENABLED_KEY = 'sync.spExtractionMonitoringEnabled';
export const SP_EXTRACTION_THRESHOLD_KEY = 'sync.spExtractionThresholdSp';

export const DEFAULT_SP_EXTRACTION_THRESHOLD_SP = SP_EXTRACTION_CHUNK_SP;

export const useSpExtractionMonitoringEnabled = createSyncedSetting<boolean>({
  key: SP_EXTRACTION_ENABLED_KEY,
  defaultValue: false,
});

export const useSpExtractionThresholdSp = createSyncedSetting<number>({
  key: SP_EXTRACTION_THRESHOLD_KEY,
  defaultValue: DEFAULT_SP_EXTRACTION_THRESHOLD_SP,
  parse: (raw) => (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null),
});

export const SP_FARM_CHARACTERS_KEY = 'sync.spFarmCharacters';

export const NO_SP_FARM_CHARACTERS: readonly number[] = [];

export const useSpFarmCharacters = createSyncedSetting<readonly number[]>({
  key: SP_FARM_CHARACTERS_KEY,
  defaultValue: NO_SP_FARM_CHARACTERS,
  parse: parseStarredCharacters,
});

export const isSpFarmCharacter = isCharacterStarred;

export const withToggledSpFarm = withToggledStar;
