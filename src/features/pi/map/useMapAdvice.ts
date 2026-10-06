/**
 * Everything the Map reads, gathered the way the Plan tab gathers it, and fed
 * to the one recommendation model. The Map never prices anything itself: this
 * hook builds a `PlanAdviceInput` (snapshot, hub books, sell market, cadence,
 * the Plan tab's rebuild preference (`usePlanPreference`), every recipe) and
 * returns `buildPlanAdvice`'s answer. Two tabs reading the same model with the same input show the same
 * figures.
 *
 * What-if advice (a planet type the pilot does not have, added) is built on
 * demand and cached per input, so trying all eight types costs at most eight
 * builds and a re-render never repeats one.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadGoalPlannerSnapshot, type GoalPlannerSnapshot } from '../goalPlannerSnapshot';
import { buildPlanAdvice, type PlanAdvice } from '../planAdviceModel';
import { homeSystemId } from '../sellRoute';
import { usePlanPreference } from '../planTicksPref';
import { usePiAdviceInputs } from '../usePiAdviceInputs';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { FinderOrigin } from './MapDetail';
import type { MapColony } from './PlanMap';
import { buildMapGraph, type MapGraph } from './mapModel';
import { colonyCountUnknown } from '../colonyStripModel';

export type MapAdviceState =
  | { status: 'loading' }
  | { status: 'failed' }
  | {
      status: 'ready';
      graph: MapGraph;
      advice: PlanAdvice;
      adviceWithWhatIf: (type: PlanetType) => PlanAdvice;
      colonies: MapColony[];
      finder: FinderOrigin;
      /** The colony read failed: the board runs as for a pilot with no colonies, plus this notice. */
      esiFailed: { retry: () => void; retrying: boolean } | null;
      /** The colony list is unread (ESI silent, or a re-login needed): not "no colonies". */
      coloniesUnknown: boolean;
      /** Hub prices could not be read: the board runs on empty books, so no product has an ISK figure. */
      pricesFailed: boolean;
    };

export function useMapAdvice(
  characterId: number,
  planetLabel: (planetId: number) => string
): MapAdviceState {
  const [loaded, setLoaded] = useState<{
    characterId: number;
    snapshot: GoalPlannerSnapshot;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [retrying, setRetrying] = useState(false);
  // Keep the last snapshot while re-reading: the board and the notice stay mounted, so Retry keeps focus.
  const retry = useCallback(() => {
    setRetrying(true);
    setReloadKey((key) => key + 1);
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadGoalPlannerSnapshot(characterId).then(
      (snapshot) => {
        if (cancelled) return;
        setFailedFor(null);
        setLoaded({ characterId, snapshot });
        setRetrying(false);
      },
      () => {
        if (cancelled) return;
        setFailedFor(characterId);
        setRetrying(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, reloadKey]);
  const snapshot = loaded?.characterId === characterId ? loaded.snapshot : null;

  // The Plan tab's Most ISK / Least hauling choice, so both tabs rank alike.
  const preference = usePlanPreference((state) => state.value);
  const preferenceHydrated = usePlanPreference((state) => state.hydrated);
  const hydratePreference = usePlanPreference((state) => state.hydrate);
  useEffect(() => {
    void hydratePreference();
  }, [hydratePreference]);
  const inputs = usePiAdviceInputs(snapshot, characterId, preference);
  // Wait for the stored choice: ranking by the default first would flash the wrong picks.
  const input =
    (inputs.status === 'ready' || inputs.status === 'prices-failed') && preferenceHydrated
      ? (inputs.input ?? null)
      : null;
  const pi = snapshot?.pi ?? null;

  const graph = useMemo(() => (pi ? buildMapGraph(pi) : null), [pi]);
  const built = useMemo(() => {
    if (!input) return null;
    let advice: PlanAdvice;
    try {
      advice = buildPlanAdvice(input);
    } catch {
      return 'error' as const;
    }
    const cache = new Map<PlanetType, PlanAdvice>();
    const adviceWithWhatIf = (type: PlanetType): PlanAdvice => {
      let hit = cache.get(type);
      if (!hit) {
        hit = buildPlanAdvice({ ...input, whatIfTypes: [type] });
        cache.set(type, hit);
      }
      return hit;
    };
    return { advice, adviceWithWhatIf };
  }, [input]);

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

  if (failedFor === characterId || built === 'error') return { status: 'failed' };
  if (!built || !graph) return { status: 'loading' };
  const esiFailed = snapshot?.fetchFailed ? { retry, retrying } : null;
  const coloniesUnknown = colonyCountUnknown(snapshot);
  return {
    status: 'ready',
    graph,
    ...built,
    colonies,
    finder,
    esiFailed,
    coloniesUnknown,
    pricesFailed: inputs.status === 'prices-failed',
  };
}
