import { useCallback, useState } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import type { AppliedDpsInputs } from '@/engine/fittings/appliedDps';
import type { DamageProfile, PilotProfile } from '@/engine/fittings/types';
import { useStatsConditions } from './statsConditions';
import { evaluateFitting } from './useFittingEvaluation';
import { useFittingChoices, type FittingChoices } from './useFittingChoices';

export interface OverlayFitting {
  options: Pick<FittingChoices, 'saved' | 'inGame'>;
  selectedId: string | null;
  select: (id: string | null) => void;
  result: { name: string; applied: AppliedDpsInputs } | null;
}

export function useOverlayFitting({
  characterId,
  profile,
  damageProfile,
}: {
  characterId: number | null;
  profile: PilotProfile | null;
  damageProfile: DamageProfile;
}): OverlayFitting {
  const choices = useFittingChoices(characterId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const conditions = useStatsConditions();

  const [selectedFor, setSelectedFor] = useState(characterId);
  if (selectedFor !== characterId) {
    setSelectedFor(characterId);
    setSelectedId(null);
  }

  const choiceId = choices.all.find((c) => c.id === selectedId)?.id ?? null;
  const { resolve } = choices;

  const load = useCallback(async (): Promise<OverlayFitting['result']> => {
    if (choiceId === null || profile === null) return null;
    const picked = await resolve(choiceId);
    if (!picked) return null;
    const stats = await evaluateFitting(picked.fitting, profile, damageProfile, conditions);
    return { name: picked.name, applied: stats.applied };
  }, [choiceId, resolve, profile, damageProfile, conditions]);
  const result = useAsyncLoad(load).data ?? null;

  return {
    options: choices,
    selectedId: choiceId,
    select: setSelectedId,
    result,
  };
}
