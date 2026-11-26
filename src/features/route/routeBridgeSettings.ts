import { useEffect } from 'react';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const ROUTE_BRIDGES_KEY = 'routeBridges';

export const useRouteBridgesEnabled = createLocalSetting<boolean>({
  key: ROUTE_BRIDGES_KEY,
  defaultValue: false,
});

export interface RouteBridgeQuery {
  enabled: boolean;
  hydrated: boolean;
}

export function useRouteBridgeQuery(override: boolean | null): RouteBridgeQuery {
  const enabled = useRouteBridgesEnabled((state) => state.value);
  const hydrated = useRouteBridgesEnabled((state) => state.hydrated);
  useEffect(() => {
    void useRouteBridgesEnabled.getState().hydrate();
  }, []);
  return { enabled: override ?? enabled, hydrated };
}
