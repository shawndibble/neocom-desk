/**
 * Route Safety's preference cards (Safer / Shorter / Less secure): the same
 * trip planned once per Route Preference, facts side by side.
 *
 * Conditions, never verdicts (decision `20260912-172628`): a card carries its
 * route's numbers and nothing that ranks it. No card is "best", "recommended"
 * or "safest"; the only thing said of a card besides its facts is that its
 * route is exactly another card's.
 */
import type { RoutePreferenceKind } from './jumpRoute';
import type { RouteSafetySummary } from './routeSafety';

/** One preference's planned trip: the systems flown, in order, and what they add up to. */
export interface PreferenceRoute {
  systemIds: readonly number[];
  /** Each system's security, in flight order; `null` for one the snapshot does not know. */
  securities: readonly (number | null)[];
  summary: RouteSafetySummary;
}

export interface PreferenceCard {
  preference: RoutePreferenceKind;
  /** The Route Preference the page is showing. */
  active: boolean;
  /** `null` until this preference's route has been planned. */
  summary: RouteSafetySummary | null;
  /** The route's systems' security in flight order, for the card's strip; empty until planned. */
  securities: readonly (number | null)[];
  /** Ship plus pod kills in the last hour; `null` when any system's is unknown, never 0. */
  kills: number | null;
  /** An earlier card whose route is exactly this one's, so a reader is not told twice. */
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
