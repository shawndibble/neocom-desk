import { idSetKey } from '@/lib/idSetKey';
import { loadCharacterSkills } from './data';
import { toAccountSkillLevels } from './skillMap';
import type { SkillLevels } from '@/engine/industry/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { ACCOUNT_SNAPSHOT_ID } from '@/lib/routeSnapshotCache';
import { useWarmLoad } from '@/lib/useWarmLoad';

const NO_LEVELS: ReadonlyMap<number, SkillLevels> = new Map();

async function loadAccountSkillLevels(key: string): Promise<ReadonlyMap<number, SkillLevels>> {
  const characterIds = key === '' ? [] : key.split(',').map(Number);
  const byCharacter = new Map<number, SkillLevels>();
  await mapWithConcurrencyLimit(characterIds, ESI_FANOUT_CONCURRENCY, async (id) => {
    const result = await loadCharacterSkills(id);
    if (result) byCharacter.set(id, toAccountSkillLevels(result.data.skills));
  });
  return byCharacter;
}

export function useAccountSkillLevels(
  characterIds: readonly number[]
): ReadonlyMap<number, SkillLevels> {
  const key = idSetKey(characterIds);
  return useWarmLoad(
    `accountSkillLevels:${key}`,
    ACCOUNT_SNAPSHOT_ID,
    () => loadAccountSkillLevels(key),
    NO_LEVELS
  );
}
