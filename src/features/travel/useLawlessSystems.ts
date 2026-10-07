import { useEffect, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadLawlessSystems } from './lawlessSystems';

const NONE: ReadonlySet<number> = new Set();

/**
 * The systems under a lawless insurgency right now (issue #2870), once read;
 * empty while loading, with no signed-in Character, or when the list is stale.
 */
export function useLawlessSystems(): ReadonlySet<number> {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const [lawless, setLawless] = useState<ReadonlySet<number>>(NONE);
  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void loadLawlessSystems(characterId).then((next) => {
      if (!cancelled) setLawless(next.size === 0 ? NONE : next);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  return characterId === null ? NONE : lawless;
}
