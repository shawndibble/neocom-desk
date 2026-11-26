import { captureException } from '@sentry/react';
import { useEffect, useState } from 'react';
import { referenceSkillsMultiplier } from '@/engine/industry/characterModifiers';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { loadReprocessing } from '@/sde/loadSde';
import { useActiveCharacter } from '@/stores/activeCharacter';

export function useReferenceSkillsMultiplier(): number | null {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const [loaded, setLoaded] = useState<{ characterId: number; multiplier: number } | null>(null);

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const [modifiers, reprocessing] = await Promise.all([
          loadCharacterModifiers(characterId, Date.now()),
          loadReprocessing(),
        ]);
        if (cancelled) return;
        const skillIds = new Set<number>();
        for (const type of Object.values(reprocessing)) {
          if (type.specialisationSkillID !== undefined) skillIds.add(type.specialisationSkillID);
        }
        setLoaded({
          characterId,
          multiplier: referenceSkillsMultiplier(modifiers, [...skillIds]),
        });
      } catch (error) {
        captureException(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  return characterId !== null && loaded?.characterId === characterId ? loaded.multiplier : null;
}
