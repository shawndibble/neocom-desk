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
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useHydratedStore } from '@/lib/useHydratedStore';

export type PiAdviceInputsState =
  | { status: 'loading' }
  /** Prices unreadable. `input` runs on empty books (null until skills load): only price-free wins survive, ISK figures null. */
  | { status: 'prices-failed'; input: PlanAdviceInput | null }
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
  const shared = useContext(SharedAdviceInputs);
  const served =
    shared !== null &&
    snapshot !== null &&
    shared.characterId === characterId &&
    shared.snapshot === snapshot;
  // Always called so the hook order is stable; no snapshot loads nothing.
  const local = useLiveAdviceInputs(served ? null : snapshot, characterId, preference, reloadKey);
  return served ? withPreference(shared.state, preference) : local;
}

interface SharedInputs {
  characterId: number;
  snapshot: GoalPlannerSnapshot | null;
  state: PiAdviceInputsState;
}

const SharedAdviceInputs = createContext<SharedInputs | null>(null);

/**
 * Reads the advice inputs once for a subtree. The PI page mounts this inside its
 * `PiSnapshotProvider` so Plan, Map and Colonies share one prices, skills and
 * routes load, and one model run per preference, across tab switches.
 */
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

/** The shared state re-read under another preference; the same input object per (input, preference), so the advice cache hits. */
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
  const { hub, buybackPct } = useSellHub();
  const cadence = useCadence((state) => state.value);
  const goalPrefs = useGoalPlannerPrefs((state) => state.value);
  useHydratedStore(useCadence, useGoalPlannerPrefs);

  const richness = usePlanetRichness(characterId);

  const pi = snapshot?.pi ?? null;
  // Keyed by hub only: a refresh of the colonies keeps the last prices on
  // screen instead of blanking every figure while they are read again.
  // `reloadKey` re-reads them: it is a dependency of the loader on purpose.
  const loadPrices = useCallback(
    () => (pi ? loadGoalPlannerPrices(hub, pi) : Promise.reject(new Error('no snapshot'))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reloadKey` is the caller's "read again" signal, not read by the loader.
    [pi, hub, reloadKey]
  );
  const pricedLoad = useKeyedLoad(pi ? hub.id : null, loadPrices);
  const pricedNow =
    pricedLoad.status === 'idle' || pricedLoad.status === 'loading' ? null : pricedLoad;
  const prices = pricedLoad.data ?? null;
  const pricesFailed = pricedNow !== null && (prices === null || prices.failed);

  const nowMs = snapshot?.nowMs ?? null;
  // Keyed by character: a re-read of the colonies keeps the last skills too.
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
    // One sweep out of the hub answers every colony, not a search per colony.
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
    // Hold until the routes settle: ready-without-routes would run the whole advice model, then run it again with them.
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
      books: hubBooks(usable ?? { prices: {}, buyPrices: {} }, snapshot.accountingLevel),
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
    hub.systemName,
  ]);
}
