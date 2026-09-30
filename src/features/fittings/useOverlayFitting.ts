/**
 * A second, saved Fitting overlaid on the applied-DPS graphs (issue #1546):
 * picked from the active Character's My Fittings or In-game Fittings and calculated under the
 * same pilot and Damage Profile as the open one — cheap once the engine is
 * loaded. Needs a Character, so the Share Link view has no overlay.
 */
import { useEffect, useState } from 'react';
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
  const [result, setResult] = useState<OverlayFitting['result']>(null);
  const conditions = useStatsConditions();

  // A Fitting belongs to one Character.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character, not a render-time derivation
    setSelectedId(null);
  }, [characterId]);

  const choiceId = choices.all.find((c) => c.id === selectedId)?.id ?? null;
  const { resolve } = choices;

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new selection, not a render-time derivation
    setResult(null);
    if (choiceId === null || profile === null) return;
    void (async () => {
      try {
        const picked = await resolve(choiceId);
        if (!picked || cancelled) return;
        const stats = await evaluateFitting(picked.fitting, profile, damageProfile, conditions);
        if (!cancelled) setResult({ name: picked.name, applied: stats.applied });
      } catch {
        // An overlay that won't calculate simply isn't drawn.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [choiceId, resolve, profile, damageProfile, conditions]);

  // A since-deleted Fitting reads as no overlay rather than a blank pick.
  return {
    options: choices,
    selectedId: choiceId,
    select: setSelectedId,
    result,
  };
}
