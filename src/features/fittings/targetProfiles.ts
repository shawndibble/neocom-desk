/**
 * The pilot's Target Profiles (issue #1546): the custom list and which
 * profile is selected, as two synced settings — the same split, and for the
 * same reason, as `damageProfiles.ts`. The selection is global, not per
 * Fitting, and stays out of the `?f=` Fitting Share Code.
 */
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
import {
  SYNCED_CUSTOM_TARGET_PROFILES_KEY,
  SYNCED_SELECTED_TARGET_PROFILE_KEY,
} from '@/sync/syncedSettings';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useCustomProfiles, type CustomProfiles } from './useCustomProfiles';

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

export type TargetProfiles = CustomProfiles<CustomTargetProfile, NamedTargetProfile>;

export function useTargetProfiles(): TargetProfiles {
  return useCustomProfiles({
    useCustom: useCustomTargetProfiles,
    useSelectedId: useSelectedTargetProfileId,
    defaultId: DEFAULT_TARGET_PROFILE_ID,
    resolve: resolveTargetProfile,
  });
}
