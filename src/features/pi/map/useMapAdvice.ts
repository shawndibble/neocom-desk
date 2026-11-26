import { useMemo } from 'react';
import type { PlanAdvice, PlanAdviceInput } from '../planAdviceModel';
import { askAdvice } from '../planAdviceAsync';
import { useAdviceOf } from '../useAdviceOf';
import { homeSystemId } from '../sellRoute';
import { usePlanPreference } from '../planTicksPref';
import { usePiAdviceInputs } from '../usePiAdviceInputs';
import { usePiSnapshot } from '../usePiSnapshot';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { PiData } from '@/sde/types';
import type { FinderOrigin } from './MapDetail';
import type { MapColony } from './PlanMap';
import { buildMapGraph, type MapGraph } from './mapModel';
import { whatIfKey, whatIfTypesOf } from '../biggerChainsModel';
import { useChainEstimates, type ChainEstimateOf } from '../useChainEstimates';
import { useHydratedStore } from '@/lib/useHydratedStore';

export type MapAdviceState =
  | { status: 'loading' }
  | { status: 'failed' }
  | {
      status: 'ready';
      graph: MapGraph;
      advice: PlanAdvice;
      adviceWithWhatIf: (types: ReadonlySet<PlanetType>) => PlanAdvice | Promise<PlanAdvice>;
      colonies: MapColony[];
      finder: FinderOrigin;
      esiFailed: { retry: () => void; retrying: boolean } | null;
      pricesFailed: boolean;
      chainOf: ChainEstimateOf;
      pi: PiData;
    };

export function useMapAdvice(
  characterId: number,
  planetLabel: (planetId: number) => string
): MapAdviceState {
  const { snapshot, failed, retrying, retry } = usePiSnapshot(characterId);

  const preference = usePlanPreference((state) => state.value);
  const preferenceHydrated = useHydratedStore(usePlanPreference);
  const inputs = usePiAdviceInputs(snapshot, characterId, preference);
  const input =
    (inputs.status === 'ready' || inputs.status === 'prices-failed') && preferenceHydrated
      ? (inputs.input ?? null)
      : null;
  const pi = snapshot?.pi ?? null;

  const graph = useMemo(() => (pi ? buildMapGraph(pi) : null), [pi]);
  const buildResult = useAdviceOf(input);
  const built = useMemo(() => {
    if (buildResult.status === 'pending') return null;
    if (buildResult.status === 'error' || !input) return 'error' as const;
    const { advice } = buildResult;
    const cache = new Map<string, PlanAdviceInput>();
    const adviceWithWhatIf = (types: ReadonlySet<PlanetType>): Promise<PlanAdvice> => {
      const key = whatIfKey([...types]);
      let variant = cache.get(key);
      if (!variant) {
        variant = { ...input, whatIfTypes: whatIfTypesOf(key) };
        cache.set(key, variant);
      }
      return askAdvice(variant);
    };
    return { advice, adviceWithWhatIf };
  }, [buildResult, input]);

  const colonies = useMemo<MapColony[]>(
    () =>
      (snapshot?.colonies ?? []).map((colony) => ({
        planetId: colony.planet_id,
        type: colony.planet_type as PlanetType,
        name: snapshot?.planetNames.get(colony.planet_id) ?? planetLabel(colony.planet_id),
      })),
    [snapshot, planetLabel]
  );
  const finder = useMemo<FinderOrigin>(() => {
    const id = homeSystemId((snapshot?.colonies ?? []).map((c) => c.solar_system_id));
    return {
      systemId: id,
      name: id === null ? null : (snapshot?.systemNames.get(id) ?? null),
      security: id === null ? null : (snapshot?.securityBySystem.get(id) ?? null),
    };
  }, [snapshot]);

  const chainOf = useChainEstimates(
    built && built !== 'error' && inputs.status === 'ready' ? built.advice.chainBasis : null,
    pi
  );

  if (failed || built === 'error') return { status: 'failed' };
  if (!built || !graph || !pi) return { status: 'loading' };
  const esiFailed = snapshot?.fetchFailed ? { retry, retrying } : null;
  return {
    status: 'ready',
    graph,
    ...built,
    colonies,
    finder,
    esiFailed,
    pricesFailed: inputs.status === 'prices-failed',
    chainOf,
    pi,
  };
}
