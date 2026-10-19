/**
 * Everything the Map reads, gathered the way the Plan tab gathers it, and fed
 * to the one recommendation model. The Map never prices anything itself: this
 * hook builds a `PlanAdviceInput` (snapshot, hub books, sell market, cadence,
 * the Plan tab's rebuild preference (`usePlanPreference`), every recipe) and
 * returns `buildPlanAdvice`'s answer. Two tabs reading the same model with the same input show the same
 * figures.
 *
 * The main advice is built off the main thread (`useAdviceOf`). What-if advice
 * (a planet type the pilot does not have, added) is built on demand on the page
 * and cached per input, so trying all eight types costs at most eight builds
 * and a re-render never repeats one.
 */
import { useMemo } from 'react';
import { buildPlanAdvice, type PlanAdvice } from '../planAdviceModel';
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
      adviceWithWhatIf: (types: ReadonlySet<PlanetType>) => PlanAdvice;
      colonies: MapColony[];
      finder: FinderOrigin;
      /** The colony read failed: the board runs as for a pilot with no colonies, plus this notice. */
      esiFailed: { retry: () => void; retrying: boolean } | null;
      /** Hub prices could not be read: the board runs on empty books, so no product has an ISK figure. */
      pricesFailed: boolean;
      /** P3/P4 multi-planet chain estimates, priced in slices after the board draws. */
      chainOf: ChainEstimateOf;
      pi: PiData;
    };

export function useMapAdvice(
  characterId: number,
  planetLabel: (planetId: number) => string
): MapAdviceState {
  // Keep the last snapshot while re-reading: the board and the notice stay mounted, so Retry keeps focus.
  const { snapshot, failed, retrying, retry } = usePiSnapshot(characterId);

  // The Plan tab's Most ISK / Least hauling choice, so both tabs rank alike.
  const preference = usePlanPreference((state) => state.value);
  const preferenceHydrated = useHydratedStore(usePlanPreference);
  const inputs = usePiAdviceInputs(snapshot, characterId, preference);
  // Wait for the stored choice: ranking by the default first would flash the wrong picks.
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
    const cache = new Map<string, PlanAdvice>();
    const adviceWithWhatIf = (types: ReadonlySet<PlanetType>): PlanAdvice => {
      const key = whatIfKey([...types]);
      let hit = cache.get(key);
      if (!hit) {
        hit = buildPlanAdvice({ ...input, whatIfTypes: whatIfTypesOf(key) });
        cache.set(key, hit);
      }
      return hit;
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
