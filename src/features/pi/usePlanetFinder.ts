/**
 * The planet finder's reads: where the pilot is, and the nearest systems that
 * hold the planet types a recipe needs. The origin is the system with most of
 * their colonies; with none, the character's current system; with neither it
 * is unknown and the finder says so. It never assumes a trade hub.
 */
import { useCallback, useMemo } from 'react';
import type { PlanetType } from '@/engine/pi/goalTypes';
import {
  nearestSystemsWithPlanetTypes,
  type NearestPlanetTypesResult,
} from '@/engine/pi/nearestPlanetTypes';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadPiSystemPlanets } from '@/sde/loadSde';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { homeSystemId } from './sellRoute';

/** How far the finder looks, and how many systems it lists. */
export const FINDER_MAX_JUMPS = 12;
export const FINDER_LIMIT = 5;

export interface FinderOrigin {
  status: 'loading' | 'known' | 'unknown';
  systemId: number | null;
  name: string | null;
  security: number | null;
  /** Where the origin came from: the colonies, or where the pilot is now. */
  source: 'colonies' | 'location' | null;
}

const LOADING: FinderOrigin = {
  status: 'loading',
  systemId: null,
  name: null,
  security: null,
  source: null,
};

const UNKNOWN: FinderOrigin = { ...LOADING, status: 'unknown' };

export function useFinderOrigin(
  characterId: number,
  colonySystemIds: readonly number[]
): FinderOrigin {
  // The origin depends on the colonies only through their home system.
  const fromColonies = homeSystemId(colonySystemIds);
  const loader = useCallback(async (): Promise<FinderOrigin> => {
    try {
      const systemId =
        fromColonies ?? (await loadCharacterSolarSystemId(characterId).catch(() => null));
      if (systemId === null) return UNKNOWN;
      const systems = await loadSolarSystemsById().catch(() => null);
      const entry = systems?.get(systemId);
      return {
        status: 'known',
        systemId,
        name: entry?.name ?? null,
        security: entry?.security ?? null,
        source: fromColonies === null ? 'location' : 'colonies',
      };
    } catch {
      return UNKNOWN;
    }
  }, [characterId, fromColonies]);
  const load = useKeyedLoad(`${characterId}|${fromColonies}`, loader);
  return load.data ?? LOADING;
}

export interface FoundSystem extends NearestPlanetTypesResult {
  name: string | null;
}

export type FinderState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; systems: FoundSystem[] };

export function usePlanetFinder(args: {
  originSystemId: number | null;
  types: readonly PlanetType[];
  highsecOnly: boolean;
}): FinderState {
  const { originSystemId, highsecOnly } = args;
  const typesKey = args.types.join(',');
  const loader = useCallback(async (): Promise<FoundSystem[]> => {
    if (originSystemId === null) return [];
    const [graph, systemPlanets, systems] = await Promise.all([
      loadJumpGraph(),
      loadPiSystemPlanets(),
      loadSolarSystemsById(),
    ]);
    if (!graph || !systems || !systemPlanets) throw new Error('planet finder data unavailable');
    const found = nearestSystemsWithPlanetTypes({
      originSystemId,
      planetTypes: typesKey.split(',') as PlanetType[],
      maxJumps: FINDER_MAX_JUMPS,
      graph,
      securityOf: (id) => systems.get(id)?.security,
      systemPlanets,
      highsecOnly,
      limit: FINDER_LIMIT,
    });
    return found.map((system) => ({
      ...system,
      name: systems.get(system.systemId)?.name ?? null,
    }));
  }, [originSystemId, typesKey, highsecOnly]);
  const load = useKeyedLoad(
    `${originSystemId}|${typesKey}|${highsecOnly}`,
    loader,
    originSystemId === null || typesKey === ''
  );
  return useMemo<FinderState>(
    () =>
      load.status === 'ready'
        ? { status: 'ready', systems: load.data }
        : load.status === 'failed'
          ? { status: 'failed' }
          : { status: 'loading' },
    [load.status, load.data]
  );
}
