import { useEffect, useSyncExternalStore } from 'react';
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
 * Hydrates preference stores and reports whether all of them have settled.
 *
 * A component that reads a store must not rely on some other page having
 * hydrated it: a Settings form can mount with no page around it (`/settings`
 * is deep-linkable), a badge in the rail is on every route, a modal may open
 * before its page has hydrated a store it doesn't read itself. Unhydrated, a
 * control renders its default rather than the stored value — and for a packed
 * record that is destructive, not merely wrong: spreading an unhydrated
 * `{ npcStation, none, null }` over a stored `{ azbel, t2, 5 }` while changing
 * one field silently discards the rig level and the facility tax.
 *
 * `hydrate` returns early once done, so calling this from several components
 * costs nothing. Pass the stores as module-scope constants; they are the
 * effect's identity.
 */
export function useHydratedStore(...stores: HydratableStore[]): boolean {
  useEffect(() => {
    for (const store of stores) void store.getState().hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the stores are module-scope constants; the rest array is new every render
  }, stores);
  return useSyncExternalStore(
    (listener) => {
      const unsubscribes = stores.map((store) => store.subscribe(listener));
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    () => stores.every((store) => store.getState().hydrated)
  );
}
