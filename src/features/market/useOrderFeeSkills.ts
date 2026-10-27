import { useEffect, useState } from 'react';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';

export interface OrderFeeSkills {
  accountingLevel: number;
  brokerRelationsLevel: number;
}

/**
 * The Character's trained Accounting and Broker Relations levels, null with
 * nobody active or while their skills are unknown — never a made-up 0, which
 * would show the untrained rate as if it were theirs. Once skills have loaded,
 * a skill they never trained really is level 0.
 */
export function useOrderFeeSkills(characterId: number | null): OrderFeeSkills | null {
  const [loaded, setLoaded] = useState<{
    characterId: number;
    skills: OrderFeeSkills | null;
  } | null>(null);
  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void loadCorrectedSkills(characterId, Date.now(), { skipQueueWithoutScope: true }).then(
      (corrected) => {
        if (cancelled) return;
        setLoaded({
          characterId,
          skills: corrected.skillsResult
            ? {
                accountingLevel: corrected.trained.get(SKILL_IDS.accounting)?.level ?? 0,
                brokerRelationsLevel: corrected.trained.get(SKILL_IDS.brokerRelations)?.level ?? 0,
              }
            : null,
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  return loaded !== null && loaded.characterId === characterId ? loaded.skills : null;
}
