/**
 * Every given character's trained skills, fanned out and cached, for an
 * account-wide question. A character absent from the result had no
 * cached/fetched skills — callers must treat that as unknown, never "meets
 * nothing" (see `evaluateSkillGate`).
 */
import { loadCharacterSkills } from './data';
import { toAccountSkillLevels } from './skillMap';
import type { SkillLevels } from '@/engine/industry/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { ACCOUNT_SNAPSHOT_ID } from '@/lib/routeSnapshotCache';
import { useWarmLoad } from '@/lib/useWarmLoad';

const NO_LEVELS: ReadonlyMap<number, SkillLevels> = new Map();

/** `key` is the sorted, comma-joined id set `useAccountSkillLevels` builds. */
async function loadAccountSkillLevels(key: string): Promise<ReadonlyMap<number, SkillLevels>> {
  const characterIds = key === '' ? [] : key.split(',').map(Number);
  const byCharacter = new Map<number, SkillLevels>();
  // A failed fetch resolves null (loadCharacterSkills/loadWithCache) rather
  // than rejecting, so that character is simply left out of the map.
  await mapWithConcurrencyLimit(characterIds, ESI_FANOUT_CONCURRENCY, async (id) => {
    const result = await loadCharacterSkills(id);
    if (result) byCharacter.set(id, toAccountSkillLevels(result.data.skills));
  });
  return byCharacter;
}

/**
 * Starts from the last load for the same Character set (`useWarmLoad`), so a
 * page that mounts after another asked the same question doesn't re-render
 * everything that reads it when the same answer lands again.
 */
export function useAccountSkillLevels(
  characterIds: readonly number[]
): ReadonlyMap<number, SkillLevels> {
  // Stable across renders with the same members, in either order — an
  // upstream caller that rebuilds its id array on every render (a fresh
  // `.map()` over live-query rows, say) must not restart this fan-out.
  const key = [...characterIds].sort((a, b) => a - b).join(',');
  return useWarmLoad(
    `accountSkillLevels:${key}`,
    ACCOUNT_SNAPSHOT_ID,
    () => loadAccountSkillLevels(key),
    NO_LEVELS
  );
}
