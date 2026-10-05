import { useEffect, useMemo, useState } from 'react';
import type { RebuildPreference } from '@/engine/pi/planAdvice';
import type { RouteSystem } from '@/engine/pi/planHaul';
import { routeExposure } from '@/features/contractSearch/routeExposure';
import { useJumpBasis } from '@/features/route/jumpBasis';
import { useCadence } from './cadencePref';
import { loadCommandCenterUpgrades } from './colonyBudget';
import { useGoalPlannerPrefs } from './goalPlannerPrefs';
import { loadGoalPlannerPrices, type GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { buildPlanAdvice, hubBooks, type PlanAdvice } from './planAdviceModel';
import type { PlanPrices } from './planPrices';
import { loadInterplanetaryConsolidation } from './planetSlots';
import { useSellHub } from './sellHub';

export type PlanAdviceState =
  | { status: 'loading' }
  | { status: 'prices-failed' }
  | { status: 'error' }
  | { status: 'ready'; advice: PlanAdvice; pricesFetchedAt: Date; hubName: string };

interface Skills {
  commandCenterUpgrades: number | null;
  interplanetaryConsolidation: number | null;
}

/**
 * Everything `buildPlanAdvice` needs, read once and kept apart so a change to
 * one input (the sell market, the hauling preference) recomputes without
 * refetching the others: the snapshot comes in, prices follow the hub, skills
 * follow the character, and the routes to the market follow the hub and the
 * pilot's route rules. The plan is drawn as soon as prices and skills are in;
 * routes land after and re-make it, a leg that has not resolved being unknown
 * rather than assumed.
 */
export function usePlanAdvice(
  snapshot: GoalPlannerSnapshot,
  characterId: number,
  preference: RebuildPreference
): PlanAdviceState {
  const { hub, buybackPct } = useSellHub();
  const cadence = useCadence((state) => state.value);
  const hydrateCadence = useCadence((state) => state.hydrate);
  const goalPrefs = useGoalPlannerPrefs((state) => state.value);
  const hydrateGoalPrefs = useGoalPlannerPrefs((state) => state.hydrate);
  useEffect(() => {
    void hydrateCadence();
    void hydrateGoalPrefs();
  }, [hydrateCadence, hydrateGoalPrefs]);

  const { pi } = snapshot;
  const [priced, setPriced] = useState<{ hubId: string; prices: PlanPrices } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadGoalPlannerPrices(hub, pi).then((prices) => {
      if (!cancelled) setPriced({ hubId: hub.id, prices });
    });
    return () => {
      cancelled = true;
    };
  }, [pi, hub]);
  const prices = priced?.hubId === hub.id ? priced.prices : null;

  const [skillsFor, setSkillsFor] = useState<{ key: string; skills: Skills } | null>(null);
  const skillsKey = `${characterId}|${snapshot.nowMs}`;
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadCommandCenterUpgrades(characterId, snapshot.nowMs).catch(() => null),
      loadInterplanetaryConsolidation(characterId, snapshot.nowMs).catch(() => null),
    ]).then(([commandCenterUpgrades, interplanetaryConsolidation]) => {
      if (!cancelled) {
        setSkillsFor({
          key: skillsKey,
          skills: { commandCenterUpgrades, interplanetaryConsolidation },
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, snapshot.nowMs, skillsKey]);
  const skills = skillsFor?.key === skillsKey ? skillsFor.skills : null;

  const basis = useJumpBasis();
  const systemKey = useMemo(
    () =>
      [...new Set(snapshot.colonies.map((colony) => colony.solar_system_id))]
        .sort((a, b) => a - b)
        .join(','),
    [snapshot.colonies]
  );
  const routesKey = `${basis.key}|${hub.systemId}|${systemKey}`;
  const [routed, setRouted] = useState<{
    key: string;
    routes: Map<number, RouteSystem[] | null>;
  } | null>(null);
  useEffect(() => {
    if (buybackPct !== null || !basis.hydrated || systemKey === '') return;
    let cancelled = false;
    const ids = systemKey.split(',').map(Number);
    void Promise.all(
      ids.map((id) =>
        routeExposure(id, hub.systemId, basis.rules, basis.network)
          .then((result): RouteSystem[] | null =>
            result.kind === 'known'
              ? result.path.map((system) => ({
                  systemId: system.systemId,
                  security: system.security,
                }))
              : null
          )
          .catch(() => null)
      )
    ).then((routes) => {
      if (!cancelled) {
        setRouted({ key: routesKey, routes: new Map(ids.map((id, i) => [id, routes[i]])) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [basis, hub.systemId, systemKey, routesKey, buybackPct]);
  const routes = routed?.key === routesKey ? routed.routes : undefined;

  return useMemo((): PlanAdviceState => {
    if (!prices || !skills) return { status: 'loading' };
    if (prices.failed) return { status: 'prices-failed' };
    try {
      const advice = buildPlanAdvice({
        snapshot,
        prefs: {
          restartHours: cadence.restartDays * 24,
          fallbackRatePerHour: goalPrefs.fallbackRatePerHour,
          customsOverrides: snapshot.customsOverrides,
        },
        books: hubBooks(prices, snapshot.accountingLevel),
        market: buybackPct === null ? { kind: 'hub' } : { kind: 'buyback', pct: buybackPct },
        cadence,
        preference,
        recipeFilter: 'any',
        skills,
        ...(routes ? { routesBySystem: routes } : {}),
        planetNames: snapshot.planetNames,
      });
      return {
        status: 'ready',
        advice,
        pricesFetchedAt: prices.fetchedAt,
        hubName: hub.systemName,
      };
    } catch {
      return { status: 'error' };
    }
  }, [
    snapshot,
    prices,
    skills,
    cadence,
    goalPrefs,
    buybackPct,
    preference,
    routes,
    hub.systemName,
  ]);
}
