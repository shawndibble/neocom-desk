/**
 * Assets page's route preference for jumps-away distances (issue #87):
 * device-local view preference, same pattern as the Market Browser's
 * Location Mode (`features/market/locationMode.ts`) — never synced.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const ROUTE_PREFERENCE_SETTING_KEY = 'assetsRoutePreference';

export type RoutePreference = 'shortest' | 'safest';

export const DEFAULT_ROUTE_PREFERENCE: RoutePreference = 'shortest';

function isRoutePreference(raw: unknown): raw is RoutePreference {
  return raw === 'shortest' || raw === 'safest';
}

export const useRoutePreference = createLocalSetting<RoutePreference>({
  key: ROUTE_PREFERENCE_SETTING_KEY,
  defaultValue: DEFAULT_ROUTE_PREFERENCE,
  parse: (raw) => (isRoutePreference(raw) ? raw : null),
});
