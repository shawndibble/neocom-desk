import { useEffect, useState } from 'react';
import { loadCharacterClones } from '@/features/character/clones';
import { cloneOwnName, readCloneNicknames } from '@/features/character/cloneNicknames';
import { loadImplantTypeBonuses } from '../typeDetail';
import type { JumpCloneImplantSet } from './whatIfImplants';

export async function loadJumpCloneImplantSets(
  characterId: number
): Promise<JumpCloneImplantSet[]> {
  const [{ cached }, nicknames] = await Promise.all([
    loadCharacterClones(characterId),
    readCloneNicknames(),
  ]);
  const clones = cached?.data.jump_clones ?? [];
  const sets = await Promise.all(
    clones.map(async (clone, index): Promise<JumpCloneImplantSet> => ({
      id: clone.jump_clone_id,
      label: cloneOwnName(clone, nicknames) ?? `#${index + 1}`,
      bonuses: await loadImplantTypeBonuses(clone.implants),
    }))
  );
  return sets.filter((set) => Object.keys(set.bonuses).length > 0);
}

const NO_SETS: JumpCloneImplantSet[] = [];

export function useJumpCloneImplantSets(characterId: number): JumpCloneImplantSet[] {
  const [loaded, setLoaded] = useState<{ characterId: number; sets: JumpCloneImplantSet[] } | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    loadJumpCloneImplantSets(characterId).then(
      (sets) => {
        if (!cancelled) setLoaded({ characterId, sets });
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  return loaded?.characterId === characterId ? loaded.sets : NO_SETS;
}
