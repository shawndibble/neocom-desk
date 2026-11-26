import { useCallback, useMemo } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import type { DamageProfile, PilotProfile } from '@/engine/fittings/types';
import type { ChargeBasis } from './dogmaFittingEngine';
import { pilotUnder, statsOptions, type StatsConditions } from './statsConditions';

export function useChargeBasis(
  pilot: PilotProfile | null,
  damageProfile: DamageProfile | null,
  conditions: StatsConditions
): ChargeBasis | null {
  const under = useMemo(
    () => (pilot === null ? null : pilotUnder(pilot, conditions)),
    [pilot, conditions]
  );
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
