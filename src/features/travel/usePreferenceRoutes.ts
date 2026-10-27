/**
 * The Route Safety page's preference cards (Safer / Shorter / Less secure):
 * the trip being shown, planned under each Route Preference. All three are
 * local graph plans (`planLocalTrip`), never an ESI call, so they follow the
 * trip as it changes. The active preference's card reads the drawn trip itself.
 */
import { useEffect, useMemo, useState } from 'react';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import {
  preferenceCards,
  type PreferenceCard,
  type PreferenceRoute,
} from '@/engine/route/routePreferenceCards';
import { ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import type { RouteSafetyState } from './useRouteSafety';

type Planned = Partial<Record<RoutePreferenceKind, PreferenceRoute>>;

export function usePreferenceRoutes(
  state: RouteSafetyState,
  active: RoutePreferenceKind
): PreferenceCard[] {
  const [planned, setPlanned] = useState<{ requestKey: string; routes: Planned } | null>(null);
  const route = state.kind === 'route' ? state : null;
  const requestKey = route?.requestKey ?? null;
  const planWithPreference = route?.planWithPreference ?? null;
  const drawn = route?.trip ?? null;

  useEffect(() => {
    if (requestKey === null || planWithPreference === null) return;
    let cancelled = false;
    void Promise.all(
      ROUTE_PREFERENCES.filter((kind) => kind !== active).map(
        async (kind) => [kind, await planWithPreference(kind)] as const
      )
    ).then((entries) => {
      if (cancelled) return;
      const routes: Planned = {};
      for (const [kind, result] of entries) if (result !== null) routes[kind] = result;
      setPlanned({ requestKey, routes });
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, planWithPreference, active]);

  return useMemo(() => {
    const routes: Planned = planned?.requestKey === requestKey ? { ...planned.routes } : {};
    if (drawn !== null) {
      routes[active] = {
        systemIds: drawn.rows.map((row) => row.systemId),
        securities: drawn.rows.map((row) => row.security),
        summary: drawn.summary,
      };
    }
    return preferenceCards(routes, ROUTE_PREFERENCES, active);
  }, [planned, requestKey, drawn, active]);
}
