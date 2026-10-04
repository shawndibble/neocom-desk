import { useEffect } from 'react';
import type { LocalSettingStore } from '@/lib/useLocalSetting';

/**
 * Hydrates a preference store and reports whether it has settled.
 *
 * Every other page reads these stores after its own `hydrate()`; the Settings
 * forms are the only place that *writes* them, and `/settings` mounts none of
 * those pages. Without this, a cold load of `/settings` — a deep-linkable
 * route — renders every control at its default rather than the stored value.
 * For a packed record that is destructive rather than merely wrong: spreading
 * an unhydrated `{ npcStation, none, null }` over a stored `{ azbel, t2, 5 }`
 * while changing one field silently discards the rig level and the facility
 * tax.
 *
 * `fontScale` and `timeFormat` escape this only because `App.tsx` hydrates
 * them for the whole shell.
 */
export function useHydratedStore<T>(store: LocalSettingStore<T>): boolean {
  const hydrated = store((state) => state.hydrated);
  const hydrate = store((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return hydrated;
}
