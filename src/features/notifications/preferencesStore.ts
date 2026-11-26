import { db } from '@/db';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { recordByCharacterId } from './recordByCharacterId';
import {
  NOTIFICATION_CHANNELS,
  type EventEnabledMap,
  type EveTypeEnabledMap,
} from './eventSelection';
import { isQuietTimePrefs, type QuietTimePrefs } from './quietTime';
import { isCorporationIdList } from './corporationIdList';
import { isCharacterEventThresholds, type CharacterEventThresholds } from './eventThresholdFields';
import {
  SYNCED_NOTIFICATION_FEED_PREFS_KEY,
  withSyncedFeedPrefsApplied,
} from './syncedPreferences';

export const NOTIFICATION_PREFS_SETTING_KEY = 'notificationPreferences';

export interface NotificationPreferencesValue {
  masterEnabled: boolean;
  browserEnabled?: boolean;
  feedEnabled?: boolean;
  dismissOnView?: boolean;
  quietTime?: QuietTimePrefs;
  perCharacter: Record<number, EventEnabledMap>;
  eveNotificationTypesByCharacter?: Record<number, EveTypeEnabledMap>;
  thresholdsByCharacter?: Record<number, CharacterEventThresholds>;
  mutedSharedPopCorporations?: number[];
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesValue = {
  masterEnabled: true,
  perCharacter: {},
};

function isEventChannelState(raw: unknown): boolean {
  if (typeof raw === 'boolean') return true;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) =>
      (NOTIFICATION_CHANNELS as readonly string[]).includes(key) && typeof value === 'boolean'
  );
}

function isEventEnabledMap(raw: unknown): raw is EventEnabledMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.values(raw as Record<string, unknown>).every(isEventChannelState);
}

const isPerCharacterMap = recordByCharacterId(isEventEnabledMap);

function isEveTypeChannelState(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) =>
      (NOTIFICATION_CHANNELS as readonly string[]).includes(key) && typeof value === 'boolean'
  );
}

function isEveTypeEnabledMap(raw: unknown): raw is EveTypeEnabledMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.values(raw as Record<string, unknown>).every(isEveTypeChannelState);
}

const isEveNotificationTypesByCharacter = recordByCharacterId(isEveTypeEnabledMap);

function isOptionalBoolean(raw: unknown): boolean {
  return raw === undefined || typeof raw === 'boolean';
}

const isThresholdsByCharacter = recordByCharacterId(isCharacterEventThresholds);

export function mutedSharedPopCorporations(
  value: NotificationPreferencesValue
): ReadonlySet<number> {
  return new Set(value.mutedSharedPopCorporations ?? []);
}

function isNotificationPreferencesValue(raw: unknown): raw is NotificationPreferencesValue {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.masterEnabled === 'boolean' &&
    isOptionalBoolean(r.browserEnabled) &&
    isOptionalBoolean(r.feedEnabled) &&
    isOptionalBoolean(r.dismissOnView) &&
    (r.quietTime === undefined || isQuietTimePrefs(r.quietTime)) &&
    isPerCharacterMap(r.perCharacter) &&
    (r.eveNotificationTypesByCharacter === undefined ||
      isEveNotificationTypesByCharacter(r.eveNotificationTypesByCharacter)) &&
    (r.thresholdsByCharacter === undefined || isThresholdsByCharacter(r.thresholdsByCharacter)) &&
    (r.mutedSharedPopCorporations === undefined ||
      isCorporationIdList(r.mutedSharedPopCorporations))
  );
}

export const useNotificationPreferences = createLocalSetting<NotificationPreferencesValue>({
  key: NOTIFICATION_PREFS_SETTING_KEY,
  defaultValue: DEFAULT_NOTIFICATION_PREFERENCES,
  parse: (raw) => (isNotificationPreferencesValue(raw) ? raw : null),
});

export async function hydrateNotificationPreferences(): Promise<void> {
  await useNotificationPreferences.getState().hydrate();
  let record: { value: unknown } | undefined;
  try {
    record = await db.settings.get(SYNCED_NOTIFICATION_FEED_PREFS_KEY);
  } catch {
    return;
  }
  if (record === undefined) return;
  const current = useNotificationPreferences.getState().value;
  const merged = withSyncedFeedPrefsApplied(current, record.value);
  if (JSON.stringify(merged) !== JSON.stringify(current)) {
    await useNotificationPreferences.getState().setValue(merged);
  }
}

export function characterEventPrefs(
  value: NotificationPreferencesValue,
  characterId: number
): EventEnabledMap {
  return value.perCharacter[characterId] ?? {};
}

export function isBrowserChannelEnabled(value: NotificationPreferencesValue): boolean {
  return value.browserEnabled ?? true;
}

export function isDismissOnView(value: NotificationPreferencesValue): boolean {
  return value.dismissOnView ?? false;
}

export function isFeedChannelEnabled(value: NotificationPreferencesValue): boolean {
  return value.feedEnabled ?? true;
}

export function characterEveTypePrefs(
  value: NotificationPreferencesValue,
  characterId: number
): EveTypeEnabledMap {
  return value.eveNotificationTypesByCharacter?.[characterId] ?? {};
}
