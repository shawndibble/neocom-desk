import { useTranslation } from 'react-i18next';
import {
  CUSTOM_DAMAGE_PROFILE_ID_PREFIX,
  UNIFORM_DAMAGE_PROFILE_ID,
  builtInDamageProfileKey,
  parseCustomDamageProfiles,
  parseSelectedDamageProfileId,
  resolveDamageProfile,
  type CustomDamageProfile,
  type NamedDamageProfile,
} from '@/engine/fittings/damageProfile';
import {
  SYNCED_CUSTOM_DAMAGE_PROFILES_KEY,
  SYNCED_SELECTED_DAMAGE_PROFILE_KEY,
} from '@/sync/syncedSettings';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useCustomProfiles, type CustomProfiles } from './useCustomProfiles';

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

export function useDamageProfileName(): (profile: NamedDamageProfile) => string {
  const { t } = useTranslation();
  return (profile) => {
    const key = builtInDamageProfileKey(profile.id);
    if (key !== null) return t(`fittings.damageProfile.builtin.${key}`);
    return 'name' in profile && typeof profile.name === 'string' ? profile.name : profile.id;
  };
}

export function newCustomDamageProfileId(): string {
  return `${CUSTOM_DAMAGE_PROFILE_ID_PREFIX}${crypto.randomUUID()}`;
}

export type DamageProfiles = CustomProfiles<CustomDamageProfile, NamedDamageProfile>;

export function useDamageProfiles(): DamageProfiles {
  return useCustomProfiles({
    useCustom: useCustomDamageProfiles,
    useSelectedId: useSelectedDamageProfileId,
    defaultId: UNIFORM_DAMAGE_PROFILE_ID,
    resolve: resolveDamageProfile,
  });
}
