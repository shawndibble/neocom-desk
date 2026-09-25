/**
 * A second, saved Fitting overlaid on the applied-DPS graphs (issue #1546):
 * picked from the active Character's My Fittings and calculated under the
 * same pilot and Damage Profile as the open one — cheap once the engine is
 * loaded. Needs a Character, so the Share Link view has no overlay.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FittingRecord } from '@/db';
import type { AppliedDpsInputs } from '@/engine/fittings/appliedDps';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { DamageProfile, PilotProfile } from '@/engine/fittings/types';
import { useAbyssalWeather } from './abyssalWeatherSelection';
import { evaluateFitting } from './useFittingEvaluation';

export interface OverlayFitting {
  /** The Character's saved Fittings, by name. */
  options: { id: string; name: string }[];
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
  const records = useLiveQuery(
    () =>
      characterId === null
        ? Promise.resolve([] as FittingRecord[])
        : db.fittings.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<OverlayFitting['result']>(null);
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);

  // A saved Fitting belongs to one Character.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character, not a render-time derivation
    setSelectedId(null);
  }, [characterId]);

  const record = records?.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new selection, not a render-time derivation
    setResult(null);
    if (record === null || profile === null) return;
    void (async () => {
      try {
        const decoded = await decodeFittingShare(record.code);
        if (!decoded.ok || cancelled) return;
        const fitting = shareToFitting(decoded.value, record.name);
        const stats = await evaluateFitting(fitting, profile, damageProfile, weatherTypeId);
        if (!cancelled) setResult({ name: record.name, applied: stats.applied });
      } catch {
        // An overlay that won't calculate simply isn't drawn.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [record, profile, damageProfile, weatherTypeId]);

  const options = useMemo(
    () =>
      (records ?? [])
        .map((r) => ({ id: r.id, name: r.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [records]
  );

  // A since-deleted saved Fitting reads as no overlay rather than a blank pick.
  return { options, selectedId: record ? selectedId : null, select: setSelectedId, result };
}
