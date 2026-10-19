/**
 * The state shared by the pilot's Damage Profiles and Target Profiles: a
 * synced custom list plus a synced selected id, both global (not per Fitting).
 * `damageProfiles.ts` and `targetProfiles.ts` supply the stores and the
 * resolver; the save/delete rules live here once.
 */
import { useCallback, useMemo } from 'react';
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface CustomProfilesConfig<C extends { id: string }, N> {
  useCustom: LocalSettingStore<C[]>;
  useSelectedId: LocalSettingStore<string>;
  /** The id a deleted selection falls back to. */
  defaultId: string;
  resolve: (selectedId: string, custom: C[]) => N;
}

export interface CustomProfiles<C, N> {
  /** Both stores have been read, so `selected` is the stored choice rather than the pre-read default. */
  hydrated: boolean;
  custom: C[];
  /** The profile in force — the default when the stored id names nothing. */
  selected: N;
  select: (id: string) => void;
  /** Adds a new custom profile, or replaces the one with the same id. */
  saveCustom: (profile: C) => void;
  deleteCustom: (id: string) => void;
}

export function useCustomProfiles<C extends { id: string }, N>({
  useCustom,
  useSelectedId,
  defaultId,
  resolve,
}: CustomProfilesConfig<C, N>): CustomProfiles<C, N> {
  const custom = useCustom((s) => s.value);
  const setCustom = useCustom((s) => s.setValue);
  const selectedId = useSelectedId((s) => s.value);
  const select = useSelectedId((s) => s.setValue);

  const hydrated = useHydratedStore(useCustom, useSelectedId);

  // Memoized: the stats effect depends on it, and a fresh object every render
  // would recalculate the fit on every render.
  const selected = useMemo(() => resolve(selectedId, custom), [resolve, selectedId, custom]);

  // Both writes rewrite the whole list, so they read the store's current
  // value at write time rather than this render's — never a stale or
  // not-yet-hydrated `[]` that would wipe every other profile on every device.
  const saveCustom = useCallback(
    (profile: C) => {
      const current = useCustom.getState().value;
      const exists = current.some((p) => p.id === profile.id);
      void setCustom(
        exists ? current.map((p) => (p.id === profile.id ? profile : p)) : [...current, profile]
      );
    },
    [useCustom, setCustom]
  );

  const deleteCustom = useCallback(
    (id: string) => {
      void setCustom(useCustom.getState().value.filter((p) => p.id !== id));
      // A deleted selection already resolves to the default; say so in
      // storage too, so another device doesn't keep a dangling id.
      if (useSelectedId.getState().value === id) void select(defaultId);
    },
    [useCustom, useSelectedId, setCustom, select, defaultId]
  );

  return {
    hydrated,
    custom,
    selected,
    select: (id) => void select(id),
    saveCustom,
    deleteCustom,
  };
}
