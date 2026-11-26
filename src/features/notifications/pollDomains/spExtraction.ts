import { loadCharacterSkillsWithStatus } from '@/features/skills/data';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
  useSpFarmCharacters,
  isSpFarmCharacter,
} from '@/features/character/spExtractionSettings';
import type {
  SpExtractionEntrySnapshot,
  SpExtractionFire,
  SpExtractionSnapshot,
} from '@/engine/notificationDiffs';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

const isSpExtractionEntrySnapshot = shapeGuard<SpExtractionEntrySnapshot>({
  totalSp: is.number,
  thresholdSp: is.number,
});

async function currentSpExtractionEnabled(): Promise<boolean> {
  await useSpExtractionMonitoringEnabled.getState().hydrate();
  return useSpExtractionMonitoringEnabled.getState().value;
}

async function isMarkedSpFarm(characterId: number): Promise<boolean> {
  await useSpFarmCharacters.getState().hydrate();
  return isSpFarmCharacter(useSpFarmCharacters.getState().value, characterId);
}

async function currentSpExtractionThresholdSp(): Promise<number> {
  await useSpExtractionThresholdSp.getState().hydrate();
  return useSpExtractionThresholdSp.getState().value;
}

export const spExtractionDomain = defineDomain<
  SpExtractionEntrySnapshot,
  SpExtractionSnapshot,
  SpExtractionFire
>({
  source: SNAPSHOT_SOURCES.spExtraction,
  stateKey: 'notifications.pollerState.spExtraction',
  entriesKey: 'entries',
  isEntry: isSpExtractionEntrySnapshot,
  load: async (characterId) => {
    if (!(await currentSpExtractionEnabled())) return null;
    if (!(await isMarkedSpFarm(characterId))) return [];
    const result = await loadCharacterSkillsWithStatus(characterId);
    if (result.needsReauth || result.cached === null) return null;
    const thresholdSp = await currentSpExtractionThresholdSp();
    return [{ totalSp: result.cached.data.total_sp, thresholdSp }];
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});
