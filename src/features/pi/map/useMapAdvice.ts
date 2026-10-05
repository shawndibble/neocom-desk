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
import { loadInterplanetaryConsolidation } from '../planetSlots';
import { loadCommandCenterUpgrades } from '../colonyBudget';
import { useCadence } from '../cadencePref';
import { useGoalPlannerPrefs } from '../goalPlannerPrefs';
import {
  loadGoalPlannerPrices,
  loadGoalPlannerSnapshot,
  type GoalPlannerSnapshot,
} from '../goalPlannerSnapshot';
import {
  buildPlanAdvice,
  hubBooks,
  type PlanAdvice,
  type PlanAdviceInput,
} from '../planAdviceModel';
import type { PlanPrices } from '../planPrices';
import { homeSystemId } from '../sellRoute';
import { useSellHub } from '../sellHub';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { FinderOrigin } from './MapDetail';
import type { MapColony } from './PlanMap';
import { buildMapGraph, type MapGraph } from './mapModel';

export type MapAdviceState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'reauth' }
  | {
      status: 'ready';
      graph: MapGraph;
      advice: PlanAdvice;
      adviceWithWhatIf: (type: PlanetType) => PlanAdvice;
      colonies: MapColony[];
      finder: FinderOrigin;
    };

interface Skills {
  commandCenterUpgrades: number | null;
  interplanetaryConsolidation: number | null;
}

export function useMapAdvice(
  characterId: number,
  planetLabel: (planetId: number) => string
): MapAdviceState {
  const [loaded, setLoaded] = useState<{
    characterId: number;
    snapshot: GoalPlannerSnapshot;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<number | null>(null);
  const [skills, setSkills] = useState<{ characterId: number; skills: Skills } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoalPlannerSnapshot(characterId).then(
      (snapshot) => {
        if (cancelled) return;
        setFailedFor(null);
        setLoaded({ characterId, snapshot });
        void Promise.all([
          loadCommandCenterUpgrades(characterId, snapshot.nowMs).catch(() => null),
          loadInterplanetaryConsolidation(characterId, snapshot.nowMs).catch(() => null),
        ]).then(([commandCenterUpgrades, interplanetaryConsolidation]) => {
          if (!cancelled) {
            setSkills({
              characterId,
              skills: { commandCenterUpgrades, interplanetaryConsolidation },
            });
          }
        });
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
  const loadedSkills = skills?.characterId === characterId ? skills.skills : null;

  const prefs = useGoalPlannerPrefs((state) => state.value);
  const hydratePrefs = useGoalPlannerPrefs((state) => state.hydrate);
  const cadence = useCadence((state) => state.value);
  const hydrateCadence = useCadence((state) => state.hydrate);
  useEffect(() => {
    void hydratePrefs();
    void hydrateCadence();
  }, [hydratePrefs, hydrateCadence]);

  const { hub, buybackPct } = useSellHub();
  const [priced, setPriced] = useState<{ hubId: string; prices: PlanPrices } | null>(null);
  const pi = snapshot?.pi ?? null;
  useEffect(() => {
    if (!pi) return;
    let cancelled = false;
    void loadGoalPlannerPrices(hub, pi).then((prices) => {
      if (!cancelled) setPriced({ hubId: hub.id, prices });
    });
    return () => {
      cancelled = true;
    };
  }, [pi, hub]);
  const prices = priced?.hubId === hub.id ? priced.prices : null;

  const input = useMemo((): PlanAdviceInput | null => {
    if (!snapshot || !prices || !loadedSkills) return null;
    return {
      snapshot,
      prefs: {
        restartHours: cadence.restartDays * 24,
        fallbackRatePerHour: prefs.fallbackRatePerHour,
        customsOverrides: snapshot.customsOverrides,
      },
      books: hubBooks(prices, snapshot.accountingLevel),
      market: buybackPct === null ? { kind: 'hub' } : { kind: 'buyback', pct: buybackPct },
      cadence,
      preference: 'isk',
      recipeFilter: 'any',
      skills: loadedSkills,
      planetNames: snapshot.planetNames,
    };
  }, [snapshot, prices, loadedSkills, cadence, prefs.fallbackRatePerHour, buybackPct]);

  const graph = useMemo(() => (pi ? buildMapGraph(pi) : null), [pi]);
  const built = useMemo(() => {
    if (!input) return null;
    const advice = buildPlanAdvice(input);
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

  if (failedFor === characterId) return { status: 'failed' };
  if (snapshot?.needsReauth) return { status: 'reauth' };
  if (!built || !graph) return { status: 'loading' };
  return { status: 'ready', graph, ...built, colonies, finder };
}
