import { useCallback } from 'react';
import { spaceOfSystem } from '@/engine/pilotList/grouping';
import type { KillSpace } from '@/engine/pilotList/killActivity';
import { useCurrentSystem, type CurrentSystemState } from '@/features/route/currentSystem';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { lookupSolarSystem } from '@/sde/solarSystems';

export interface HereSpace {
  current: CurrentSystemState;
  space: KillSpace | null;
}

export function useHereSpace(): HereSpace {
  const current = useCurrentSystem();
  const systemId = current.systemId;
  const loader = useCallback(async () => {
    if (systemId === null) return null;
    const found = await lookupSolarSystem(systemId).catch(() => null);
    return found ? { id: systemId, security: found.security } : null;
  }, [systemId]);
  const load = useKeyedLoad(systemId === null ? null : String(systemId), loader);
  return {
    current,
    space: systemId === null ? null : spaceOfSystem(load.status === 'ready' ? load.data : null),
  };
}
