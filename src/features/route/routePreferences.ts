/**
 * The Route Preferences a reader can choose between — the game's Prefer
 * shorter / safer / less secure — shared by every route picker and Settings →
 * Travel. The pilot's default is persisted there (`routeRules.ts`); a page's
 * own picker keeps its override in the URL, or in view state on Assets.
 */
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';

/** In the order a hauler weighs them. */
export const ROUTE_PREFERENCES: readonly RoutePreferenceKind[] = [
  'prefer-highsec',
  'shortest',
  'avoid-highsec',
];

/** Literal keys, so the locale split finds them from every page that names this module. */
export const ROUTE_PREFERENCE_LABEL_KEYS: Readonly<Record<RoutePreferenceKind, string>> = {
  'prefer-highsec': 'contractSearch.routePreference.prefer-highsec',
  shortest: 'contractSearch.routePreference.shortest',
  'avoid-highsec': 'contractSearch.routePreference.avoid-highsec',
};
