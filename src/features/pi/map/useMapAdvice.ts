/**
 * Everything the Map reads, gathered the way the Plan tab gathers it, and fed
 * to the one recommendation model. The Map never prices anything itself: this
 * hook builds a `PlanAdviceInput` (snapshot, hub books, sell market, cadence,
 * the rebuild preference "Most ISK", every recipe) and returns `buildPlanAdvice`'s
 * answer. Two tabs reading the same model with the same input show the same
 * figures.
 *
 * What-if advice (a planet type the pilot does not have, added) is built on
 * demand and cached per input, so trying all eight types costs at most eight
 * builds and a re-render never repeats one.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadGoalPlannerSnapshot, type GoalPlannerSnapshot } from '../goalPlannerSnapshot';
import { buildPlanAdvice, type PlanAdvice } from '../planAdviceModel';
import { homeSystemId } from '../sellRoute';
import { usePiAdviceInputs } from '../usePiAdviceInputs';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { FinderOrigin } from './MapDetail';
import type { MapColony } from './PlanMap';
import { buildMapGraph, type MapGraph } from './mapModel';

export type MapAdviceState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'prices-failed' }
  | { status: 'reauth' }
  | {
      status: 'ready';
      graph: MapGraph;
      advice: PlanAdvice;
      adviceWithWhatIf: (type: PlanetType) => PlanAdvice;
      colonies: MapColony[];
      finder: FinderOrigin;
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
  useEffect(() => {
    let cancelled = false;
    loadGoalPlannerSnapshot(characterId).then(
      (snapshot) => {
        if (cancelled) return;
        setFailedFor(null);
        setLoaded({ characterId, snapshot });
      },
      () => {
        if (!cancelled) setFailedFor(characterId);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  const snapshot = loaded?.characterId === characterId ? loaded.snapshot : null;

  const inputs = usePiAdviceInputs(snapshot, characterId, 'isk');
  const input = inputs.status === 'ready' ? inputs.input : null;
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
        type: colony.planet_type as PlanetType,
        name: snapshot?.planetNames.get(colony.planet_id) ?? planetLabel(colony.planet_id),
      })),
    [snapshot, planetLabel]
  );
  const finder = useMemo<FinderOrigin>(() => {
    const id = homeSystemId((snapshot?.colonies ?? []).map((c) => c.solar_system_id));
    return { systemId: id, name: id === null ? null : (snapshot?.systemNames.get(id) ?? null) };
  }, [snapshot]);

  if (failedFor === characterId || built === 'error') return { status: 'failed' };
  if (snapshot?.needsReauth) return { status: 'reauth' };
  if (inputs.status === 'prices-failed') return { status: 'prices-failed' };
  if (!built || !graph) return { status: 'loading' };
  return { status: 'ready', graph, ...built, colonies, finder };
}
