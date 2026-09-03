/**
 * Notification preferences: device-local (CONTEXT.md round 20, same category
 * as font scale / Market's Location Mode) — never synced, since the browser
 * permission this eventually gates is itself per-device. One master switch
 * gates everything; below it, every Notification Event is independently
 * toggleable per Character, on by default (absence from a character's map
 * means enabled — see `eventSelection.ts`).
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { isEventEnabled, toggleAllEvents, type EventEnabledMap } from './eventSelection';
import type { NotificationEventId } from './events';

export const NOTIFICATION_PREFS_SETTING_KEY = 'notificationPreferences';

export interface NotificationPreferencesValue {
  masterEnabled: boolean;
  /**
   * Delivery channels, both gated by `masterEnabled` above and by the
   * per-Character event toggles below. Absent means enabled — the same
   * "absence is on" idiom `eventSelection.ts` uses, which is what lets
   * preferences stored before channels existed keep every per-Character
   * toggle instead of being rejected by `parse` and reset to defaults.
   *
   * They are genuinely independent, not a fallback chain: the browser
   * channel needs a permission grant and a platform that can raise a
   * notification (never iOS while closed), while the feed works everywhere
   * and is the only channel some devices will ever see.
   */
  browserEnabled?: boolean;
  feedEnabled?: boolean;
  perCharacter: Record<number, EventEnabledMap>;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesValue = {
  masterEnabled: true,
  perCharacter: {},
};

function isEventEnabledMap(raw: unknown): raw is EventEnabledMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.values(raw as Record<string, unknown>).every((v) => typeof v === 'boolean');
}

function isPerCharacterMap(raw: unknown): raw is Record<number, EventEnabledMap> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isEventEnabledMap(value)
  );
}

function isOptionalBoolean(raw: unknown): boolean {
  return raw === undefined || typeof raw === 'boolean';
}

function isNotificationPreferencesValue(raw: unknown): raw is NotificationPreferencesValue {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.masterEnabled === 'boolean' &&
    isOptionalBoolean(r.browserEnabled) &&
    isOptionalBoolean(r.feedEnabled) &&
    isPerCharacterMap(r.perCharacter)
  );
}

export const useNotificationPreferences = createLocalSetting<NotificationPreferencesValue>({
  key: NOTIFICATION_PREFS_SETTING_KEY,
  defaultValue: DEFAULT_NOTIFICATION_PREFERENCES,
  parse: (raw) => (isNotificationPreferencesValue(raw) ? raw : null),
});

export function characterEventPrefs(
  value: NotificationPreferencesValue,
  characterId: number
): EventEnabledMap {
  return value.perCharacter[characterId] ?? {};
}

/** Browser (OS) notifications on this device. Absent means on. */
export function isBrowserChannelEnabled(value: NotificationPreferencesValue): boolean {
  return value.browserEnabled ?? true;
}

/** The Overview's Notification Feed. Absent means on. */
export function isFeedChannelEnabled(value: NotificationPreferencesValue): boolean {
  return value.feedEnabled ?? true;
}

export function withBrowserEnabled(
  value: NotificationPreferencesValue,
  browserEnabled: boolean
): NotificationPreferencesValue {
  return { ...value, browserEnabled };
}

export function withFeedEnabled(
  value: NotificationPreferencesValue,
  feedEnabled: boolean
): NotificationPreferencesValue {
  return { ...value, feedEnabled };
}

export function withMasterEnabled(
  value: NotificationPreferencesValue,
  masterEnabled: boolean
): NotificationPreferencesValue {
  return { ...value, masterEnabled };
}

export function withEventToggled(
  value: NotificationPreferencesValue,
  characterId: number,
  eventId: NotificationEventId
): NotificationPreferencesValue {
  const prefs = characterEventPrefs(value, characterId);
  return {
    ...value,
    perCharacter: {
      ...value.perCharacter,
      [characterId]: { ...prefs, [eventId]: !isEventEnabled(prefs, eventId) },
    },
  };
}

export function withAllEventsToggledForCharacter(
  value: NotificationPreferencesValue,
  characterId: number,
  eventIds: readonly NotificationEventId[]
): NotificationPreferencesValue {
  const prefs = characterEventPrefs(value, characterId);
  return {
    ...value,
    perCharacter: {
      ...value.perCharacter,
      [characterId]: toggleAllEvents(eventIds, prefs),
    },
  };
}
