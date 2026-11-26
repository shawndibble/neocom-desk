import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { SettingState } from './settingStore';

type HydratableStore = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- value type is irrelevant here, and a store of T is not assignable to a store of unknown
  getState: () => Pick<SettingState<any>, 'hydrated' | 'hydrate'>;
  subscribe: (listener: () => void) => () => void;
};

export function useHydratedStore(...stores: HydratableStore[]): boolean {
  const storesRef = useRef(stores);
  useEffect(() => {
    storesRef.current = stores;
    for (const store of stores) void store.getState().hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stores are module-scope constants; the rest array is new every render
  }, stores);
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribes = storesRef.current.map((store) => store.subscribe(listener));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, []);
  return useSyncExternalStore(subscribe, () => stores.every((store) => store.getState().hydrated));
}
