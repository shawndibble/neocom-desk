/**
 * Route Safety's "Use jump bridges" switch (issue #2478): whether its routes
 * may cross the Ansiblex the pilot's characters found or the pilot pasted.
 *
 * Route Safety only, like the hole settings beside it: no other page's jump
 * count should change with a private bridge list. Unlike them it is a
 * device-local default, not a synced one — the list it switches on lives on
 * this device alone (`features/travel/ansiblexGates.ts`), so on another
 * device it would switch on nothing. Overridable in the page's link (`jb`).
 */
import { useEffect } from 'react';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const ROUTE_BRIDGES_KEY = 'routeBridges';

export const useRouteBridgesEnabled = createLocalSetting<boolean>({
  key: ROUTE_BRIDGES_KEY,
  defaultValue: false,
});

export interface RouteBridgeQuery {
  enabled: boolean;
  /** False until the saved default has been read, so nothing routes once on the default. */
  hydrated: boolean;
}

/** Whether a Route Safety route may cross bridges: the link's say, else the saved default. */
export function useRouteBridgeQuery(override: boolean | null): RouteBridgeQuery {
  const enabled = useRouteBridgesEnabled((state) => state.value);
  const hydrated = useRouteBridgesEnabled((state) => state.hydrated);
  useEffect(() => {
    void useRouteBridgesEnabled.getState().hydrate();
  }, []);
  return { enabled: override ?? enabled, hydrated };
}
