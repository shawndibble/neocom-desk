import { useCallback } from 'react';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export interface OrderFeeSkills {
  accountingLevel: number;
  brokerRelationsLevel: number;
}

export function useOrderFeeSkills(characterId: number | null): OrderFeeSkills | null {
  const loader = useCallback(
    () =>
      loadCorrectedSkills(characterId ?? 0, Date.now(), { skipQueueWithoutScope: true }).then(
        (corrected): OrderFeeSkills | null =>
          corrected.skillsResult
            ? {
                accountingLevel: corrected.trained.get(SKILL_IDS.accounting)?.level ?? 0,
                brokerRelationsLevel: corrected.trained.get(SKILL_IDS.brokerRelations)?.level ?? 0,
              }
            : null
      ),
    [characterId]
  );
  return useKeyedLoad(characterId === null ? null : String(characterId), loader).data ?? null;
}
