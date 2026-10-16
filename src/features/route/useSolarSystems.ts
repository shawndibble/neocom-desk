/**
 * The local solar-system snapshot as React state, for `SolarSystemPicker` and
 * its callers.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadSolarSystems } from '@/sde/loadMarketSde';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { loadSolarSystemsById, lookupSolarSystem } from '@/sde/solarSystems';
import { onReconnect } from '@/stores/network';

export interface SolarSystemList {
  /** `null` until the list loads (or while it has failed and nothing is cached). */
  systems: readonly SolarSystemEntry[] | null;
  /** The read failed: an empty picker means "couldn't load", not "no such system". */
  failed: boolean;
  /** Reads the list again. Also done by itself when the connection returns. */
  retry: () => void;
}

/**
 * Every solar system, fetched only once `enabled` first turns true. A failed
 * read is reported (`failed`) instead of becoming an empty list, and is retried
 * when the connection returns.
 */
export function useSolarSystemList(enabled: boolean): SolarSystemList {
  const [systems, setSystems] = useState<readonly SolarSystemEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || systems !== null) return;
    let cancelled = false;
    loadSolarSystems().then(
      (entries) => {
        if (cancelled) return;
        setFailed(false);
        setSystems(entries);
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, systems, attempt]);
  useEffect(() => {
    if (!failed) return;
    return onReconnect(() => setAttempt((n) => n + 1));
  }, [failed]);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);
  return { systems, failed, retry };
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
