import { useEffect, useState } from 'react';
import { loadCharacterClones } from '@/features/character/clones';
import { loadUniverseType } from '../data';
import { extractAttributeBonuses, sumAttributeBonuses } from '../dogma';
import type { JumpCloneImplantSet } from './whatIfImplants';

/**
 * Each jump clone that carries at least one attribute implant, with its
 * bonuses summed. Clones with none (skill/ship implants only) are dropped —
 * they would be a preset identical to "None". An unreadable clone list is
 * "no clones": the What-If picker just shows its usual presets.
 */
export async function loadJumpCloneImplantSets(
  characterId: number
): Promise<JumpCloneImplantSet[]> {
  const { cached } = await loadCharacterClones(characterId);
  const clones = cached?.data.jump_clones ?? [];
  const sets = await Promise.all(
    clones.map(async (clone, index): Promise<JumpCloneImplantSet> => {
      const types = await Promise.all(clone.implants.map((id) => loadUniverseType(id)));
      return {
        id: clone.jump_clone_id,
        label: clone.name?.trim() || `#${index + 1}`,
        bonuses: sumAttributeBonuses(
          types.map((type) => extractAttributeBonuses(type?.data?.dogma_attributes))
        ),
      };
    })
  );
  return sets.filter((set) => Object.keys(set.bonuses).length > 0);
}

const NO_SETS: JumpCloneImplantSet[] = [];

/** The character's jump-clone presets; empty until (and unless) they load. */
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
  // Another character's clones are never shown while this one's are loading.
  return loaded?.characterId === characterId ? loaded.sets : NO_SETS;
}
