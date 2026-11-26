import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { RebuildPreference } from '@/engine/pi/planAdvice';
import type { RouteSystem } from '@/engine/pi/planHaul';
import { localRoutesFromOrigin } from '@/features/route/localRoute';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { useSharedJumpBasis } from '@/features/route/jumpBasis';
import { useCadence } from './cadencePref';
import { loadCommandCenterUpgrades } from './colonyBudget';
import { useGoalPlannerPrefs } from './goalPlannerPrefs';
import { loadGoalPlannerPrices, type GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { hubBooks, type PlanAdviceInput } from './planAdviceModel';
import type { PlanPrices } from './planPrices';
import { loadInterplanetaryConsolidation } from './planetSlots';
import { usePlanetRichness } from './richnessOverride';
import { useSellHub } from './sellHub';
import { usePiSnapshot } from './usePiSnapshot';
import { hubFeeDiscountFactor } from '@/market/hubs';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useHydratedStore } from '@/lib/useHydratedStore';

export type PiAdviceInputsState =
  | { status: 'loading' }
  | { status: 'prices-failed'; input: PlanAdviceInput | null }
  | { status: 'ready'; input: PlanAdviceInput; prices: PlanPrices; hubName: string };

interface Skills {
  commandCenterUpgrades: number | null;
  interplanetaryConsolidation: number | null;
}

export function usePiAdviceInputs(
  snapshot: GoalPlannerSnapshot | null,
  characterId: number | null,
  preference: RebuildPreference,
  reloadKey = 0
): PiAdviceInputsState {
  const shared = useContext(SharedAdviceInputs);
  const served =
    shared !== null &&
    snapshot !== null &&
    shared.characterId === characterId &&
    shared.snapshot === snapshot;
  const local = useLiveAdviceInputs(served ? null : snapshot, characterId, preference, reloadKey);
  return served ? withPreference(shared.state, preference) : local;
}

interface SharedInputs {
  characterId: number;
  snapshot: GoalPlannerSnapshot | null;
  state: PiAdviceInputsState;
}

const SharedAdviceInputs = createContext<SharedInputs | null>(null);

export function PiAdviceInputsProvider({
  characterId,
  reloadKey = 0,
  children,
}: {
  characterId: number;
  reloadKey?: number;
  children: ReactNode;
}) {
  const { snapshot } = usePiSnapshot(characterId, reloadKey);
  const state = useLiveAdviceInputs(snapshot, characterId, 'isk', reloadKey);
  return createElement(
    SharedAdviceInputs.Provider,
    { value: { characterId, snapshot, state } },
    children
  );
}

const byPreference = new WeakMap<PlanAdviceInput, Map<RebuildPreference, PlanAdviceInput>>();

function inputFor(input: PlanAdviceInput, preference: RebuildPreference): PlanAdviceInput {
  if (input.preference === preference) return input;
  let variants = byPreference.get(input);
  if (!variants) byPreference.set(input, (variants = new Map()));
  let variant = variants.get(preference);
  if (!variant) variants.set(preference, (variant = { ...input, preference }));
  return variant;
}

function withPreference(state: PiAdviceInputsState, preference: RebuildPreference) {
  if (state.status === 'loading') return state;
  if (state.status === 'ready') return stable(state, inputFor(state.input, preference));
  return state.input ? stable(state, inputFor(state.input, preference)) : state;
}

const states = new WeakMap<PlanAdviceInput, PiAdviceInputsState>();
function stable(
  state: Exclude<PiAdviceInputsState, { status: 'loading' }>,
  input: PlanAdviceInput
): PiAdviceInputsState {
  if (state.input === input) return state;
  let hit = states.get(input);
  if (!hit) states.set(input, (hit = { ...state, input }));
  return hit;
}

function useLiveAdviceInputs(
  snapshot: GoalPlannerSnapshot | null,
  characterId: number | null,
  preference: RebuildPreference,
  reloadKey: number
): PiAdviceInputsState {
  const { hub, hydrated: hubHydrated, buybackPct } = useSellHub();
  const cadence = useCadence((state) => state.value);
  const goalPrefs = useGoalPlannerPrefs((state) => state.value);
  useHydratedStore(useCadence, useGoalPlannerPrefs);

  const richness = usePlanetRichness(characterId);

  const pi = snapshot?.pi ?? null;
  const loadPrices = useCallback(
    () => (pi ? loadGoalPlannerPrices(hub, pi) : Promise.reject(new Error('no snapshot'))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reloadKey` is the caller's "read again" signal, not read by the loader.
    [pi, hub, reloadKey]
  );
  const pricedLoad = useKeyedLoad(pi && hubHydrated ? hub.id : null, loadPrices);
  const pricedNow =
    pricedLoad.status === 'idle' || pricedLoad.status === 'loading' ? null : pricedLoad;
  const prices = pricedLoad.data ?? null;
  const pricesFailed = pricedNow !== null && (prices === null || prices.failed);

  const nowMs = snapshot?.nowMs ?? null;
  const loadSkills = useCallback(async (): Promise<Skills> => {
    if (characterId === null || nowMs === null) throw new Error('no character');
    const [commandCenterUpgrades, interplanetaryConsolidation] = await Promise.all([
      loadCommandCenterUpgrades(characterId, nowMs).catch(() => null),
      loadInterplanetaryConsolidation(characterId, nowMs).catch(() => null),
    ]);
    return { commandCenterUpgrades, interplanetaryConsolidation };
  }, [characterId, nowMs]);
  const skills =
    useKeyedLoad(characterId !== null && nowMs !== null ? String(characterId) : null, loadSkills)
      .data ?? null;

  const basis = useSharedJumpBasis();
  const colonies = snapshot?.colonies;
  const systemKey = useMemo(
    () =>
      [...new Set((colonies ?? []).map((colony) => colony.solar_system_id))]
        .sort((a, b) => a - b)
        .join(','),
    [colonies]
  );
  const routesKey = `${basis.key}|${hub.systemId}|${systemKey}`;
  const loadRoutes = useCallback(async () => {
    const ids = systemKey === '' ? [] : systemKey.split(',').map(Number);
    const [swept, systems] = await Promise.all([
      localRoutesFromOrigin(hub.systemId, ids, basis.rules, basis.network).catch(() => null),
      loadSolarSystemsById().catch(() => null),
    ]);
    return new Map<number, RouteSystem[] | null>(
      ids.map((id) => {
        const path = swept?.kind === 'known' ? swept.routes.get(id) : null;
        return [
          id,
          path && systems
            ? path.map((systemId) => ({
                systemId,
                security: systems.get(systemId)?.security ?? null,
              }))
            : null,
        ];
      })
    );
  }, [basis.rules, basis.network, hub.systemId, systemKey]);
  const routes = useKeyedLoad(
    routesKey,
    loadRoutes,
    buybackPct !== null || !basis.hydrated || systemKey === ''
  ).data;

  return useMemo((): PiAdviceInputsState => {
    if (!snapshot) return { status: 'loading' };
    const usable = pricesFailed ? null : prices;
    if (buybackPct === null && systemKey !== '' && !routes) return { status: 'loading' };
    if (!skills || !richness) {
      return pricesFailed ? { status: 'prices-failed', input: null } : { status: 'loading' };
    }
    if (!pricesFailed && !usable) return { status: 'loading' };
    const input: PlanAdviceInput = {
      snapshot,
      prefs: {
        restartHours: cadence.restartDays * 24,
        fallbackRatePerHour: goalPrefs.fallbackRatePerHour,
        customsOverrides: snapshot.customsOverrides,
        richness,
      },
      books: hubBooks(
        usable ?? { prices: {}, buyPrices: {} },
        snapshot.accountingLevel,
        hubFeeDiscountFactor(hub, snapshot.nowMs)
      ),
      market: buybackPct === null ? { kind: 'hub' } : { kind: 'buyback', pct: buybackPct },
      cadence,
      preference,
      recipeFilter: 'any',
      skills,
      ...(routes ? { routesBySystem: routes } : {}),
      planetNames: snapshot.planetNames,
    };
    if (!usable) return { status: 'prices-failed', input };
    return { status: 'ready', prices: usable, hubName: hub.systemName, input };
  }, [
    snapshot,
    prices,
    pricesFailed,
    skills,
    richness,
    cadence,
    goalPrefs,
    buybackPct,
    preference,
    routes,
    systemKey,
    hub,
  ]);
}
