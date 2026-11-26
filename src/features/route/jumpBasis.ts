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
  network: RouteGraphExtras;
  key: string;
  hydrated: boolean;
  podKillsUnavailable: boolean;
}

const NO_HOLES: readonly TheraConnection[] = [];

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
  const network = useMemo(() => networkFromKeys(holesKey, bridgesKey), [holesKey, bridgesKey]);

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

export function JumpBasisProvider({ children }: { children: ReactNode }) {
  const basis = useJumpBasis();
  return createElement(SharedJumpBasis.Provider, { value: basis }, children);
}

export function useSharedJumpBasis(): JumpBasis {
  const shared = useContext(SharedJumpBasis);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- provider presence is fixed for a mount
  return shared ?? useJumpBasis();
}

function networkFromKeys(holesKey: string, bridgesKey: string): RouteGraphExtras {
  return routeSafetyNetwork(holeEndsFromKey(holesKey), bridgeEndsFromKey(bridgesKey));
}

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
  const bridges = useRouteBridgesEnabled.getState().value
    ? await gatesOf().catch(() => null)
    : null;
  return {
    rules,
    network: networkFromKeys(holeNetworkKey(holes), bridges === null ? '' : bridgeKey(bridges)),
  };
}

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
