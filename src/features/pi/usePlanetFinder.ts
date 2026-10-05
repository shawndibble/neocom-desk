/**
 * The planet finder's reads: where the pilot is, and the nearest systems that
 * hold the planet types a recipe needs. The origin is the system with most of
 * their colonies; with none, the character's current system; with neither it
 * is unknown and the finder says so. It never assumes a trade hub.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PlanetType } from '@/engine/pi/goalTypes';
import {
  nearestSystemsWithPlanetTypes,
  type NearestPlanetTypesResult,
} from '@/engine/pi/nearestPlanetTypes';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadPiSystemPlanets } from '@/sde/loadSde';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';
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

export function useFinderOrigin(
  characterId: number,
  colonySystemIds: readonly number[]
): FinderOrigin {
  const key = `${characterId}|${[...colonySystemIds].sort().join(',')}`;
  const [resolved, setResolved] = useState<{ key: string; origin: FinderOrigin } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fromColonies = homeSystemId(colonySystemIds);
      const systemId =
        fromColonies ?? (await loadCharacterSolarSystemId(characterId).catch(() => null));
      const systems = systemId === null ? null : await loadSolarSystemsById().catch(() => null);
      const entry = systemId === null ? undefined : systems?.get(systemId);
      const origin: FinderOrigin =
        systemId === null
          ? { status: 'unknown', systemId: null, name: null, security: null, source: null }
          : {
              status: 'known',
              systemId,
              name: entry?.name ?? null,
              security: entry?.security ?? null,
              source: fromColonies === null ? 'location' : 'colonies',
            };
      if (!cancelled) setResolved({ key, origin });
    })().catch(() => {
      if (!cancelled) {
        setResolved({
          key,
          origin: { status: 'unknown', systemId: null, name: null, security: null, source: null },
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // `key` covers every input.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return resolved?.key === key ? resolved.origin : LOADING;
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
  const key = `${originSystemId}|${typesKey}|${highsecOnly}`;
  const [state, setState] = useState<{ key: string; value: FinderState } | null>(null);
  useEffect(() => {
    if (originSystemId === null || typesKey === '') return;
    let cancelled = false;
    void Promise.all([loadJumpGraph(), loadPiSystemPlanets(), loadSolarSystemsById()])
      .then(([graph, systemPlanets, systems]) => {
        if (cancelled) return;
        if (!graph || !systems || !systemPlanets) {
          setState({ key, value: { status: 'failed' } });
          return;
        }
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
        setState({
          key,
          value: {
            status: 'ready',
            systems: found.map((system) => ({
              ...system,
              name: systems.get(system.systemId)?.name ?? null,
            })),
          },
        });
      })
      .catch(() => {
        if (!cancelled) setState({ key, value: { status: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(
    () => (state?.key === key ? state.value : ({ status: 'loading' } as FinderState)),
    [state, key]
  );
}
