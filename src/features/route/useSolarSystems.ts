/**
 * The local solar-system snapshot as React state, for `SolarSystemPicker` and
 * its callers.
 */
import { useEffect, useState } from 'react';
import { loadSolarSystems } from '@/sde/loadMarketSde';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { loadSolarSystemsById, lookupSolarSystem } from '@/sde/solarSystems';

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

/**
 * Every system keyed by id, for a list that names one system per row (BPC
 * Sourcing's phone card) — one load, then synchronous lookups, rather than
 * `useSystemName`'s one effect per id. `null` until it loads, or if the
 * snapshot could not be read.
 */
export function useSolarSystemIndex(): ReadonlyMap<number, SolarSystemEntry> | null {
  const [index, setIndex] = useState<ReadonlyMap<number, SolarSystemEntry> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSolarSystemsById()
      .catch(() => null)
      .then((byId) => {
        if (!cancelled) setIndex(byId);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return index;
}
