/**
 * The one place a jump count's inputs are decided, so every number in the app
 * is the number Route Safety draws.
 *
 * A **jump basis** is what Route Safety plans a route under when nothing is
 * overridden in its link: the Travel Settings (preference, security penalty,
 * Avoided Systems and their pod-kill / EDENCOM / Triglavian rules) *and* the
 * saved Route Safety settings — Thera / Turnur hole jumps (hubs, ship size,
 * minimum life, EVE-Scout's open list) and known Ansiblex jump bridges. Change
 * one of them in Route Safety and every count reads the new answer: Assets,
 * Market, BPC Search, Contract Search, Courier, the order detail.
 *
 * Every count, one pair or a whole table, is then `localRoute.ts` over the
 * stargate graph under a basis (`jumpsBetween`, `localJumpDistances`,
 * `localJumpCountsForRoutes`). The one deliberate exception is the Thera
 * table's distance column: it measures the gate distance to a hole's exit
 * *before* taking that hole, so letting holes into it would put every exit one
 * jump away. Nothing else counts jumps any other way: ESI's
 * `/route/` treats Avoided Systems as a wall where the graph weighs them as a
 * cost, so asking it gave Assets a different number than the route it links to.
 */
import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { routeSafetyNetwork } from '@/engine/route/routeSafetyTrip';
import type { TheraConnection } from '@/engine/route/theraConnections';
import { routeHoles } from '@/engine/route/routeHoles';
import { gatesOf, useAnsiblexGates } from '@/features/route/ansiblexGates';
import {
  bridgeEndsFromKey,
  bridgeKey,
  holeEndsFromKey,
  holeNetworkKey,
} from '@/features/route/routeSafetyKeys';
import { useRouteHoles } from '@/features/route/useRouteHoles';
import { findLocalJumps, type RouteGraphExtras } from './localRoute';
import { loadTheraConnections } from '@/lib/eveScout';
import { useRouteBridgeQuery, useRouteBridgesEnabled } from './routeBridgeSettings';
import { loadRouteHoleQuery, NO_HOLE_OVERRIDES, useRouteHoleQuery } from './routeHoleSettings';
import { loadRouteRules, useRouteQuery, type RouteRules } from './routeRules';

export interface JumpBasis {
  rules: RouteRules;
  /** Hole and bridge connections, `{}` while those switches are off or unavailable. */
  network: RouteGraphExtras;
  /** Names the basis: equal keys count equal jumps. For keying an effect or a cache. */
  key: string;
  /** False until every setting — and, with the switches on, the hole list and gates — is read, so nothing counts once on a partial basis. */
  hydrated: boolean;
  podKillsUnavailable: boolean;
}

const NO_HOLES: readonly TheraConnection[] = [];

/**
 * The jump basis for this device's saved settings. `preferenceOverride` is a
 * page's own preference picker (Courier's, a Route Safety link's); every
 * other part is always the saved setting.
 */
export function useJumpBasis(preferenceOverride?: RoutePreferenceKind | null): JumpBasis {
  const route = useRouteQuery(preferenceOverride);
  const holeQuery = useRouteHoleQuery(NO_HOLE_OVERRIDES);
  const holesState = useRouteHoles(holeQuery);
  const bridgeQuery = useRouteBridgeQuery(null);
  const gateRecords = useAnsiblexGates();

  const holes = holesState.kind === 'ready' ? holesState.holes : NO_HOLES;
  const bridges =
    bridgeQuery.enabled && bridgeQuery.hydrated && gateRecords !== undefined ? gateRecords : null;
  const holesKey = holeNetworkKey(holes);
  const bridgesKey = bridges === null ? '' : bridgeKey(bridges);
  // Just the ends: a hole's remaining life never recounts anything.
  const network = useMemo(() => networkFromKeys(holesKey, bridgesKey), [holesKey, bridgesKey]);

  // An unreachable EVE-Scout is a settled answer (gates only), not a wait.
  const holesSettled = !holeQuery.enabled || holesState.kind !== 'loading';
  const bridgesSettled = !bridgeQuery.enabled || gateRecords !== undefined;
  const hydrated =
    route.hydrated && holeQuery.hydrated && bridgeQuery.hydrated && holesSettled && bridgesSettled;

  const key = `${route.key}|${holesKey}|${bridgesKey}`;
  const { rules, podKillsUnavailable } = route;
  return useMemo(
    () => ({ rules, network, key, hydrated, podKillsUnavailable }),
    [rules, network, key, hydrated, podKillsUnavailable]
  );
}

const SharedJumpBasis = createContext<JumpBasis | null>(null);

/**
 * Works the jump basis out once for a subtree. A page whose panels all count
 * jumps under the saved basis (Planetary Industry) mounts this once, so the
 * hole ticker and the Ansiblex live query run once instead of once per panel.
 */
export function JumpBasisProvider({ children }: { children: ReactNode }) {
  const basis = useJumpBasis();
  return createElement(SharedJumpBasis.Provider, { value: basis }, children);
}

/**
 * The saved-settings jump basis (no preference override): the enclosing
 * `JumpBasisProvider`'s when there is one, else worked out here. Whether a
 * provider exists never changes over a component's lifetime, so the hook order
 * is stable.
 */
export function useSharedJumpBasis(): JumpBasis {
  const shared = useContext(SharedJumpBasis);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- provider presence is fixed for a mount
  return shared ?? useJumpBasis();
}

function networkFromKeys(holesKey: string, bridgesKey: string): RouteGraphExtras {
  return routeSafetyNetwork(holeEndsFromKey(holesKey), bridgeEndsFromKey(bridgesKey));
}

/**
 * The jump basis read once, outside React — the notification poller's copy of
 * `useJumpBasis` with no preference override, so an alert's jump count is the
 * one Route Safety draws. An unreachable EVE-Scout counts gates only, as the
 * hook does.
 */
export async function loadJumpBasis(): Promise<Pick<JumpBasis, 'rules' | 'network'>> {
  const [rules, holeQuery] = await Promise.all([
    loadRouteRules(),
    loadRouteHoleQuery(),
    useRouteBridgesEnabled.getState().hydrate(),
  ]);
  const now = Date.now();
  const holesResult = holeQuery.enabled ? await loadTheraConnections(now) : null;
  const holes =
    holesResult?.kind === 'ok'
      ? routeHoles(holesResult.connections, holeQuery.settings, now)
      : NO_HOLES;
  // An unreadable gate list counts gates only, as the hook does while it has none.
  const bridges = useRouteBridgesEnabled.getState().value
    ? await gatesOf().catch(() => null)
    : null;
  return {
    rules,
    network: networkFromKeys(holeNetworkKey(holes), bridges === null ? '' : bridgeKey(bridges)),
  };
}

/**
 * Jumps from one system to another under a basis, as an Assets row or the
 * order detail words it. `noRoute` covers every way a count can fail once the
 * origin is known — no gate path, or the stargate snapshot unreadable.
 */
export async function jumpsBetween(
  originSystemId: number,
  destinationSystemId: number,
  basis: Pick<JumpBasis, 'rules' | 'network'>
): Promise<JumpsAwayResult> {
  if (originSystemId === destinationSystemId) return { kind: 'known', jumps: 0 };
  const result = await findLocalJumps(
    originSystemId,
    destinationSystemId,
    basis.rules,
    basis.network
  );
  return result.kind === 'known'
    ? { kind: 'known', jumps: result.jumps }
    : { kind: 'unknown', reason: 'noRoute' };
}
