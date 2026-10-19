import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { SettingState } from './settingStore';

/**
 * What the hook needs from a preference store: the bound zustand hook's
 * `getState`/`subscribe`. Loose on `T` so one call can mix value types.
 */
type HydratableStore = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- value type is irrelevant here, and a store of T is not assignable to a store of unknown
  getState: () => Pick<SettingState<any>, 'hydrated' | 'hydrate'>;
  subscribe: (listener: () => void) => () => void;
};

/**
 * Hydrates preference stores and returns true once all have settled.
 *
 * A component must not rely on another page having hydrated a store it reads:
 * `/settings` is deep-linkable, the rail is on every route. Unhydrated, a
 * control shows its default, and spreading a default packed record over the
 * stored one while editing one field silently discards the rest.
 *
 * `hydrate` is idempotent, so repeat calls are free. Pass module-scope stores,
 * a fixed count per call site.
 */
export function useHydratedStore(...stores: HydratableStore[]): boolean {
  const storesRef = useRef(stores);
  useEffect(() => {
    storesRef.current = stores;
    for (const store of stores) void store.getState().hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stores are module-scope constants; the rest array is new every render
  }, stores);
  // Stable identity: React resubscribes whenever `subscribe` changes.
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribes = storesRef.current.map((store) => store.subscribe(listener));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, []);
  return useSyncExternalStore(subscribe, () => stores.every((store) => store.getState().hydrated));
}
