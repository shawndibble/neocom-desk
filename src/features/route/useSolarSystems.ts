/**
 * The local solar-system snapshot as React state, for `SolarSystemPicker` and
 * its callers.
 */
import { useEffect, useState } from 'react';
import { loadSolarSystems } from '@/sde/loadMarketSde';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { lookupSolarSystem } from '@/sde/solarSystems';

/** Every solar system, fetched only once `enabled` first turns true. */
export function useSolarSystems(enabled: boolean): readonly SolarSystemEntry[] | null {
  const [systems, setSystems] = useState<readonly SolarSystemEntry[] | null>(null);
  useEffect(() => {
    if (!enabled || systems !== null) return;
    let cancelled = false;
    void loadSolarSystems()
      .catch(() => [])
      .then((entries) => {
        if (!cancelled) setSystems(entries);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, systems]);
  return systems;
}

/** A system's name off the local snapshot, or `null` until (or unless) it resolves. */
export function useSystemName(systemId: number | null): string | null {
  const [name, setName] = useState<{ id: number; name: string } | null>(null);
  useEffect(() => {
    if (systemId === null) return;
    let cancelled = false;
    void lookupSolarSystem(systemId)
      .then((entry) => entry?.name ?? null)
      .catch(() => null)
      .then((found) => {
        if (!cancelled && found !== null) setName({ id: systemId, name: found });
      });
    return () => {
      cancelled = true;
    };
  }, [systemId]);
  return systemId !== null && name?.id === systemId ? name.name : null;
}
