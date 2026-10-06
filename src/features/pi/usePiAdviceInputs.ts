import { useEffect, useMemo, useState } from 'react';
import type { RebuildPreference } from '@/engine/pi/planAdvice';
import type { RouteSystem } from '@/engine/pi/planHaul';
import { routeExposure } from '@/features/contractSearch/routeExposure';
import { useJumpBasis } from '@/features/route/jumpBasis';
import { useCadence } from './cadencePref';
import { loadCommandCenterUpgrades } from './colonyBudget';
import { useGoalPlannerPrefs } from './goalPlannerPrefs';
import { loadGoalPlannerPrices, type GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { hubBooks, type PlanAdviceInput } from './planAdviceModel';
import type { PlanPrices } from './planPrices';
import { loadInterplanetaryConsolidation } from './planetSlots';
import { useSellHub } from './sellHub';

export type PiAdviceInputsState =
  | { status: 'loading' }
  /** The hub's prices could not be read. The one place `{failed:true}` is consumed. */
  | { status: 'prices-failed' }
  | { status: 'ready'; input: PlanAdviceInput; prices: PlanPrices; hubName: string };

interface Skills {
  commandCenterUpgrades: number | null;
  interplanetaryConsolidation: number | null;
}

/**
 * Everything `buildPlanAdvice` needs, for Plan, Map and Colonies alike, so the
 * three tabs cannot drift apart: the snapshot comes in, prices follow the hub,
 * skills follow the character, and the routes to the market follow the hub and
 * the pilot's route rules. Each is read on its own clock, so a change to one
 * (the sell market, the hauling preference) recomputes without refetching the
 * others. The input is ready as soon as prices and skills are in; routes land
 * after and re-make it, a leg that has not resolved being unknown rather than
 * assumed.
 *
 * Prices that could not be read (a thrown read, `failed`, or a hub that quoted
 * nothing) are `prices-failed`, never zero: the caller shows the shared notice
 * and hides every figure that derives from them.
 *
 * @param reloadKey Any value that changes when prices must be re-read.
 */
export function usePiAdviceInputs(
  snapshot: GoalPlannerSnapshot | null,
  characterId: number | null,
  preference: RebuildPreference,
  reloadKey = 0
): PiAdviceInputsState {
  const { hub, buybackPct } = useSellHub();
  const cadence = useCadence((state) => state.value);
  const hydrateCadence = useCadence((state) => state.hydrate);
  const goalPrefs = useGoalPlannerPrefs((state) => state.value);
  const hydrateGoalPrefs = useGoalPlannerPrefs((state) => state.hydrate);
  useEffect(() => {
    void hydrateCadence();
    void hydrateGoalPrefs();
  }, [hydrateCadence, hydrateGoalPrefs]);

  const pi = snapshot?.pi ?? null;
  // Keyed by hub only: a refresh of the colonies keeps the last prices on
  // screen instead of blanking every figure while they are read again.
  const [priced, setPriced] = useState<{ hubId: string; prices: PlanPrices | null } | null>(null);
  useEffect(() => {
    if (!pi) return;
    let cancelled = false;
    loadGoalPlannerPrices(hub, pi).then(
      (prices) => {
        if (!cancelled) setPriced({ hubId: hub.id, prices });
      },
      () => {
        if (!cancelled) setPriced({ hubId: hub.id, prices: null });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [pi, hub, reloadKey]);
  const pricedNow = priced?.hubId === hub.id ? priced : null;
  const prices = pricedNow?.prices ?? null;
  const pricesFailed = pricedNow !== null && (prices === null || prices.failed);

  const nowMs = snapshot?.nowMs ?? null;
  // Keyed by character: a re-read of the colonies keeps the last skills too.
  const [skillsFor, setSkillsFor] = useState<{ characterId: number; skills: Skills } | null>(null);
  useEffect(() => {
    if (characterId === null || nowMs === null) return;
    let cancelled = false;
    void Promise.all([
      loadCommandCenterUpgrades(characterId, nowMs).catch(() => null),
      loadInterplanetaryConsolidation(characterId, nowMs).catch(() => null),
    ]).then(([commandCenterUpgrades, interplanetaryConsolidation]) => {
      if (!cancelled) {
        setSkillsFor({
          characterId,
          skills: { commandCenterUpgrades, interplanetaryConsolidation },
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, nowMs]);
  const skills = skillsFor?.characterId === characterId ? skillsFor.skills : null;

  const basis = useJumpBasis();
  const colonies = snapshot?.colonies;
  const systemKey = useMemo(
    () =>
      [...new Set((colonies ?? []).map((colony) => colony.solar_system_id))]
        .sort((a, b) => a - b)
        .join(','),
    [colonies]
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

  return useMemo((): PiAdviceInputsState => {
    if (!snapshot) return { status: 'loading' };
    if (pricesFailed) return { status: 'prices-failed' };
    if (!prices || !skills) return { status: 'loading' };
    return {
      status: 'ready',
      prices,
      hubName: hub.systemName,
      input: {
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
      },
    };
  }, [
    snapshot,
    prices,
    pricesFailed,
    skills,
    cadence,
    goalPrefs,
    buybackPct,
    preference,
    routes,
    hub.systemName,
  ]);
}
