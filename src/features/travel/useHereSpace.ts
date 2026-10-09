/**
 * Where the Local list is read from: the Character's Current System (ESI's
 * location, or a system picked by hand) and the kind of space it is. The list
 * groups by kills "here", so this decides which pilots read as nearby.
 */
import { useEffect, useState } from 'react';
import { spaceOfSystem } from '@/engine/pilotList/grouping';
import type { KillSpace } from '@/engine/pilotList/killActivity';
import { useCurrentSystem, type CurrentSystemState } from '@/features/route/currentSystem';
import { lookupSolarSystem } from '@/sde/solarSystems';

export interface HereSpace {
  current: CurrentSystemState;
  /** The kind of space the Current System is; null until it is known. */
  space: KillSpace | null;
}

export function useHereSpace(): HereSpace {
  const current = useCurrentSystem();
  const [entry, setEntry] = useState<{ id: number; security: number } | null>(null);
  const systemId = current.systemId;

  useEffect(() => {
    if (systemId === null) return;
    let cancelled = false;
    void lookupSolarSystem(systemId)
      .catch(() => null)
      .then((found) => {
        if (!cancelled && found) setEntry({ id: systemId, security: found.security });
      });
    return () => {
      cancelled = true;
    };
  }, [systemId]);

  // A system picked since the lookup started must not borrow the previous one's space.
  const known = entry !== null && entry.id === systemId ? entry : null;
  return { current, space: systemId === null ? null : spaceOfSystem(known) };
}
