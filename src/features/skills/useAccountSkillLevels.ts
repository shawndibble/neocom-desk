/**
 * Every given character's trained skills, fanned out and cached, for an
 * account-wide question. A character absent from the result had no
 * cached/fetched skills — callers must treat that as unknown, never "meets
 * nothing" (see `evaluateSkillGate`).
 */
import { useEffect, useState } from 'react';
import { loadCharacterSkills } from './data';
import { toAccountSkillLevels } from './skillMap';
import type { SkillLevels } from '@/engine/industry/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

export function useAccountSkillLevels(
  characterIds: readonly number[]
): ReadonlyMap<number, SkillLevels> {
  const [levels, setLevels] = useState<ReadonlyMap<number, SkillLevels>>(new Map());
  // Stable across renders with the same members, in either order — an
  // upstream caller that rebuilds its id array on every render (a fresh
  // `.map()` over live-query rows, say) must not restart this fan-out.
  const key = [...characterIds].sort((a, b) => a - b).join(',');

  useEffect(() => {
    let cancelled = false;
    const byCharacter = new Map<number, SkillLevels>();
    // A failed fetch resolves null (loadCharacterSkills/loadWithCache) rather
    // than rejecting, so that character is simply left out of the map.
    void mapWithConcurrencyLimit(characterIds, ESI_FANOUT_CONCURRENCY, async (id) => {
      const result = await loadCharacterSkills(id);
      if (result) byCharacter.set(id, toAccountSkillLevels(result.data.skills));
    }).then(() => {
      if (!cancelled) setLevels(byCharacter);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the id set's real identity; `characterIds` itself is intentionally not a dep (see the comment above `key`).
  }, [key]);

  return levels;
}
