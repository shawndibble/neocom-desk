import type { RoutePreferenceKind } from './jumpRoute';
import type { RouteSafetySummary } from './routeSafety';

export interface PreferenceRoute {
  systemIds: readonly number[];
  securities: readonly (number | null)[];
  summary: RouteSafetySummary;
}

export interface PreferenceCard {
  preference: RoutePreferenceKind;
  active: boolean;
  summary: RouteSafetySummary | null;
  securities: readonly (number | null)[];
  kills: number | null;
  sameRouteAs: RoutePreferenceKind | null;
}

const killsOf = (summary: RouteSafetySummary | null): number | null =>
  summary === null || summary.shipKills === null
    ? null
    : summary.shipKills + (summary.podKills ?? 0);

const sameSystems = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function preferenceCards(
  routes: Partial<Record<RoutePreferenceKind, PreferenceRoute>>,
  order: readonly RoutePreferenceKind[],
  active: RoutePreferenceKind
): PreferenceCard[] {
  return order.map((preference, index) => {
    const route = routes[preference];
    const twin =
      route === undefined
        ? undefined
        : order.slice(0, index).find((earlier) => {
            const other = routes[earlier];
            return other !== undefined && sameSystems(other.systemIds, route.systemIds);
          });
    return {
      preference,
      active: preference === active,
      summary: route?.summary ?? null,
      securities: route?.securities ?? [],
      kills: killsOf(route?.summary ?? null),
      sameRouteAs: twin ?? null,
    };
  });
}
