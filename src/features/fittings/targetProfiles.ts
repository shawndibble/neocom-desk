/**
 * The pilot's Target Profiles (issue #1546): the custom list and which
 * profile is selected, as two synced settings — the same split, and for the
 * same reason, as `damageProfiles.ts`. The selection is global, not per
 * Fitting, and stays out of the `?f=` Share Link.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CUSTOM_TARGET_PROFILE_ID_PREFIX,
  DEFAULT_TARGET_PROFILE_ID,
  builtInTargetProfileKey,
  parseCustomTargetProfiles,
  parseSelectedTargetProfileId,
  resolveTargetProfile,
  type CustomTargetProfile,
  type NamedTargetProfile,
} from '@/engine/fittings/targetProfile';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_CUSTOM_TARGET_PROFILES_KEY = 'sync.fittingTargetProfiles';
export const SYNCED_SELECTED_TARGET_PROFILE_KEY = 'sync.fittingTargetProfileId';

export const useCustomTargetProfiles = createSyncedSetting<CustomTargetProfile[]>({
  key: SYNCED_CUSTOM_TARGET_PROFILES_KEY,
  defaultValue: [],
  parse: parseCustomTargetProfiles,
});

export const useSelectedTargetProfileId = createSyncedSetting<string>({
  key: SYNCED_SELECTED_TARGET_PROFILE_KEY,
  defaultValue: DEFAULT_TARGET_PROFILE_ID,
  parse: parseSelectedTargetProfileId,
});

/** A profile's display name: a built-in's translated name, a custom one's own. */
export function useTargetProfileName(): (profile: NamedTargetProfile) => string {
  const { t } = useTranslation();
  return (profile) => {
    const key = builtInTargetProfileKey(profile.id);
    if (key !== null) return t(`fittings.targetProfile.builtin.${key}`);
    return 'name' in profile && typeof profile.name === 'string' ? profile.name : profile.id;
  };
}

export function newCustomTargetProfileId(): string {
  return `${CUSTOM_TARGET_PROFILE_ID_PREFIX}${crypto.randomUUID()}`;
}

export interface TargetProfiles {
  custom: CustomTargetProfile[];
  /** The profile applied DPS is worked out against — the default when the stored id names nothing. */
  selected: NamedTargetProfile;
  select: (id: string) => void;
  /** Adds a new custom profile, or replaces the one with the same id. */
  saveCustom: (profile: CustomTargetProfile) => void;
  deleteCustom: (id: string) => void;
}

export function useTargetProfiles(): TargetProfiles {
  const custom = useCustomTargetProfiles((s) => s.value);
  const setCustom = useCustomTargetProfiles((s) => s.setValue);
  const hydrateCustom = useCustomTargetProfiles((s) => s.hydrate);
  const selectedId = useSelectedTargetProfileId((s) => s.value);
  const select = useSelectedTargetProfileId((s) => s.setValue);
  const hydrateSelected = useSelectedTargetProfileId((s) => s.hydrate);

  useEffect(() => {
    void hydrateCustom();
    void hydrateSelected();
  }, [hydrateCustom, hydrateSelected]);

  const selected = useMemo(() => resolveTargetProfile(selectedId, custom), [selectedId, custom]);

  // Both writes rewrite the whole list from the store's current value, never
  // this render's possibly stale or not-yet-hydrated `[]` — see damageProfiles.ts.
  const saveCustom = useCallback(
    (profile: CustomTargetProfile) => {
      const current = useCustomTargetProfiles.getState().value;
      const exists = current.some((p) => p.id === profile.id);
      void setCustom(
        exists ? current.map((p) => (p.id === profile.id ? profile : p)) : [...current, profile]
      );
    },
    [setCustom]
  );

  const deleteCustom = useCallback(
    (id: string) => {
      void setCustom(useCustomTargetProfiles.getState().value.filter((p) => p.id !== id));
      if (useSelectedTargetProfileId.getState().value === id) {
        void select(DEFAULT_TARGET_PROFILE_ID);
      }
    },
    [setCustom, select]
  );

  return {
    custom,
    selected,
    select: (id) => void select(id),
    saveCustom,
    deleteCustom,
  };
}
