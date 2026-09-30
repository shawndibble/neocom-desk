/**
 * The Route Preferences a reader can choose between, shared by Contract
 * Search's Courier board and Route Safety (issue #2328).
 *
 * Deliberately never persisted: a second *persisted* route preference is what
 * would force unifying this vocabulary with the Assets page's own
 * `RoutePreference` and ESI's flag names, and that unification is recorded
 * (CONTEXT.md, **Route Preference**) as work to do before such a control
 * ships, not as part of either of these. Both keep it in the URL only.
 */
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';

/** In the order a hauler weighs them. */
export const ROUTE_PREFERENCES: readonly RoutePreferenceKind[] = [
  'prefer-highsec',
  'shortest',
  'avoid-highsec',
];

/**
 * Highsec-preferring by default: it is the trip most pilots will actually
 * fly, and a number quoted against a route nobody would take is the wrong one.
 */
export const DEFAULT_ROUTE_PREFERENCE: RoutePreferenceKind = 'prefer-highsec';

/** Literal keys, so the locale split finds them from every page that names this module. */
export const ROUTE_PREFERENCE_LABEL_KEYS: Readonly<Record<RoutePreferenceKind, string>> = {
  'prefer-highsec': 'contractSearch.routePreference.prefer-highsec',
  shortest: 'contractSearch.routePreference.shortest',
  'avoid-highsec': 'contractSearch.routePreference.avoid-highsec',
};
