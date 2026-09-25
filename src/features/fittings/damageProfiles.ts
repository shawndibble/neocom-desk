/**
 * The pilot's Damage Profiles (issue #1545): the custom list and which
 * profile is selected, as two synced settings rather than one blob — merging
 * is whole-value last-write-wins per key, so one blob would let "picked
 * Guristas on the laptop" clobber "edited a custom profile on the desktop".
 * The selection is global, not per Fitting: it is the pilot's lens on every
 * fit, and stays out of the `?f=` Share Link.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UNIFORM_DAMAGE_PROFILE_ID,
  builtInDamageProfileKey,
  parseCustomDamageProfiles,
  parseSelectedDamageProfileId,
  resolveDamageProfile,
  type CustomDamageProfile,
  type NamedDamageProfile,
} from '@/engine/fittings/damageProfile';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_CUSTOM_DAMAGE_PROFILES_KEY = 'sync.fittingDamageProfiles';
export const SYNCED_SELECTED_DAMAGE_PROFILE_KEY = 'sync.fittingDamageProfileId';

export const useCustomDamageProfiles = createSyncedSetting<CustomDamageProfile[]>({
  key: SYNCED_CUSTOM_DAMAGE_PROFILES_KEY,
  defaultValue: [],
  parse: parseCustomDamageProfiles,
});

export const useSelectedDamageProfileId = createSyncedSetting<string>({
  key: SYNCED_SELECTED_DAMAGE_PROFILE_KEY,
  defaultValue: UNIFORM_DAMAGE_PROFILE_ID,
  parse: parseSelectedDamageProfileId,
});

/** A profile's display name: a built-in's translated name, a custom one's own. */
export function useDamageProfileName(): (profile: NamedDamageProfile) => string {
  const { t } = useTranslation();
  return (profile) => {
    const key = builtInDamageProfileKey(profile.id);
    if (key !== null) return t(`fittings.damageProfile.builtin.${key}`);
    return 'name' in profile && typeof profile.name === 'string' ? profile.name : profile.id;
  };
}

export interface DamageProfiles {
  custom: CustomDamageProfile[];
  /** The profile stats are measured against — uniform when the stored id names nothing. */
  selected: NamedDamageProfile;
  select: (id: string) => void;
  /** Adds a new custom profile, or replaces the one with the same id. */
  saveCustom: (profile: CustomDamageProfile) => void;
  deleteCustom: (id: string) => void;
}

export function useDamageProfiles(): DamageProfiles {
  const custom = useCustomDamageProfiles((s) => s.value);
  const setCustom = useCustomDamageProfiles((s) => s.setValue);
  const hydrateCustom = useCustomDamageProfiles((s) => s.hydrate);
  const selectedId = useSelectedDamageProfileId((s) => s.value);
  const select = useSelectedDamageProfileId((s) => s.setValue);
  const hydrateSelected = useSelectedDamageProfileId((s) => s.hydrate);

  useEffect(() => {
    void hydrateCustom();
    void hydrateSelected();
  }, [hydrateCustom, hydrateSelected]);

  // Memoized: the stats effect depends on it, and a fresh object every render
  // would recalculate the fit on every render.
  const selected = useMemo(() => resolveDamageProfile(selectedId, custom), [selectedId, custom]);

  const saveCustom = useCallback(
    (profile: CustomDamageProfile) => {
      const exists = custom.some((p) => p.id === profile.id);
      void setCustom(
        exists ? custom.map((p) => (p.id === profile.id ? profile : p)) : [...custom, profile]
      );
    },
    [custom, setCustom]
  );

  const deleteCustom = useCallback(
    (id: string) => {
      void setCustom(custom.filter((p) => p.id !== id));
      // A deleted selection already resolves to uniform; say so in storage
      // too, so another device doesn't keep a dangling id.
      if (selectedId === id) void select(UNIFORM_DAMAGE_PROFILE_ID);
    },
    [custom, setCustom, selectedId, select]
  );

  return {
    custom,
    selected,
    select: (id) => void select(id),
    saveCustom,
    deleteCustom,
  };
}
