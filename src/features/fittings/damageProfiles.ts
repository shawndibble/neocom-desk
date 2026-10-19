/**
 * The pilot's Damage Profiles (issue #1545): the custom list and which
 * profile is selected, as two synced settings rather than one blob — merging
 * is whole-value last-write-wins per key, so one blob would let "picked
 * Guristas on the laptop" clobber "edited a custom profile on the desktop".
 * The selection is global, not per Fitting: it is the pilot's lens on every
 * fit, and stays out of the `?f=` Fitting Share Code.
 */
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

/** A profile's display name: a built-in's translated name, a custom one's own. */
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
