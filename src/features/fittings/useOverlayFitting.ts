/**
 * A second, saved Fitting overlaid on the applied-DPS graphs (issue #1546):
 * picked from the active Character's My Fittings or In-game Fittings and calculated under the
 * same pilot and Damage Profile as the open one — cheap once the engine is
 * loaded. Needs a Character, so the Fitting Share Code view has no overlay.
 */
import { useCallback, useState } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import type { AppliedDpsInputs } from '@/engine/fittings/appliedDps';
import type { DamageProfile, PilotProfile } from '@/engine/fittings/types';
import { useStatsConditions } from './statsConditions';
import { evaluateFitting } from './useFittingEvaluation';
import { useFittingChoices, type FittingChoices } from './useFittingChoices';

export interface OverlayFitting {
  /** The Character's saved and In-game Fittings, each list by name. */
  options: Pick<FittingChoices, 'saved' | 'inGame'>;
  selectedId: string | null;
  select: (id: string | null) => void;
  /** The selected Fitting's name and inputs, once calculated; null otherwise. */
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

  // A Fitting belongs to one Character.
  const [selectedFor, setSelectedFor] = useState(characterId);
  if (selectedFor !== characterId) {
    setSelectedFor(characterId);
    setSelectedId(null);
  }

  const choiceId = choices.all.find((c) => c.id === selectedId)?.id ?? null;
  const { resolve } = choices;

  // An overlay that won't calculate simply isn't drawn.
  const load = useCallback(async (): Promise<OverlayFitting['result']> => {
    if (choiceId === null || profile === null) return null;
    const picked = await resolve(choiceId);
    if (!picked) return null;
    const stats = await evaluateFitting(picked.fitting, profile, damageProfile, conditions);
    return { name: picked.name, applied: stats.applied };
  }, [choiceId, resolve, profile, damageProfile, conditions]);
  const result = useAsyncLoad(load).data ?? null;

  // A since-deleted Fitting reads as no overlay rather than a blank pick.
  return {
    options: choices,
    selectedId: choiceId,
    select: setSelectedId,
    result,
  };
}
