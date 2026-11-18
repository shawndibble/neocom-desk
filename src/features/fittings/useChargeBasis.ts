/**
 * What the Charge Picker and the Cap Booster Guide work a charge out under:
 * the open Fitting's own basis (`EvaluationBasis`) — the pilot with the
 * implants the page shows and any skill overrides, the Damage Profile, the
 * weather and what is projected on it — so a charge's figures match the
 * stats headline.
 */
import { useCallback, useMemo } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import type { DamageProfile, PilotProfile } from '@/engine/fittings/types';
import type { ChargeBasis } from './dogmaFittingEngine';
import { pilotUnder, statsOptions, type StatsConditions } from './statsConditions';

/** Null until the pilot and the Damage Profile are ready. */
export function useChargeBasis(
  pilot: PilotProfile | null,
  damageProfile: DamageProfile | null,
  conditions: StatsConditions
): ChargeBasis | null {
  const under = useMemo(
    () => (pilot === null ? null : pilotUnder(pilot, conditions)),
    [pilot, conditions]
  );
  // All V loads the skill list first, so the pilot arrives a tick later.
  const loadUnder = useCallback(
    () => (under instanceof Promise ? under : Promise.resolve(null)),
    [under]
  );
  const loaded = useAsyncLoad(loadUnder).data ?? null;
  const underPilot = under instanceof Promise ? loaded : under;

  return useMemo(() => {
    if (underPilot === null || damageProfile === null) return null;
    const { weatherTypeId, incoming } = statsOptions(conditions);
    return {
      pilot: underPilot,
      damageProfile,
      options: {
        ...(weatherTypeId === undefined ? {} : { weatherTypeId }),
        ...(incoming === undefined ? {} : { incoming }),
      },
    };
  }, [underPilot, damageProfile, conditions]);
}
