import { useEffect, useState } from 'react';
import {
  computeSkillGaps,
  fittingRequirementTypeIds,
  type SkillGaps,
} from '@/engine/fittings/skillGaps';
import type { Fitting } from '@/engine/fittings/types';
import { useReconnectCount } from '@/stores/network';
import { loadActivePilotProfile } from './fittingPilotProfile';
import { loadRequirementsForTypes } from './skillRequirements';

export interface FittingSkillGaps extends SkillGaps {
  unknown: boolean;
}

export function useFittingSkillGaps(
  fitting: Fitting | null,
  characterId: number | null
): FittingSkillGaps | null {
  const [result, setResult] = useState<{
    fitting: Fitting;
    characterId: number;
    gaps: FittingSkillGaps;
  } | null>(null);

  const reconnects = useReconnectCount();

  useEffect(() => {
    if (fitting === null || characterId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const typeIds = fittingRequirementTypeIds(fitting);
        const [profile, { byType, unknownTypeIds }] = await Promise.all([
          loadActivePilotProfile(characterId),
          loadRequirementsForTypes(typeIds),
        ]);
        if (cancelled) return;
        setResult({
          fitting,
          characterId,
          gaps: {
            ...computeSkillGaps(fitting, byType, profile.skillLevels),
            unknown: unknownTypeIds.length > 0,
          },
        });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting, characterId, reconnects]);

  return result && result.fitting === fitting && result.characterId === characterId
    ? result.gaps
    : null;
}
