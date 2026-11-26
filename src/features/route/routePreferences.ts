import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';

export const ROUTE_PREFERENCES: readonly RoutePreferenceKind[] = [
  'prefer-highsec',
  'shortest',
  'avoid-highsec',
];

export const ROUTE_PREFERENCE_LABEL_KEYS: Readonly<Record<RoutePreferenceKind, string>> = {
  'prefer-highsec': 'contractSearch.routePreference.prefer-highsec',
  shortest: 'contractSearch.routePreference.shortest',
  'avoid-highsec': 'contractSearch.routePreference.avoid-highsec',
};

export const ROUTE_PREFERENCE_SHORT_LABEL_KEYS: Readonly<Record<RoutePreferenceKind, string>> = {
  'prefer-highsec': 'travel.rules.preference.prefer-highsec',
  shortest: 'travel.rules.preference.shortest',
  'avoid-highsec': 'travel.rules.preference.avoid-highsec',
};
