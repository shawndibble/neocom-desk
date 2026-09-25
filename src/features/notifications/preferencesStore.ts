/**
 * The read side of notification preferences: the stored value, its validator,
 * the store, hydration, and the plain getters. Split out of `preferences.ts`
 * so the Service Worker can reach it (`feed.ts` -> `appBadge.ts`) without
 * also pulling in the writers, which import `@/sync` and the Projection
 * scheduler. Those use `import()`, and a dynamic import in a classic Service
 * Worker bundle brings `import.meta` with it -- a syntax error that stops the
 * worker from ever registering. `scripts/check-sw.mjs` guards the built file.
 *
 * `preferences.ts` re-exports everything here, so callers import from there.
 */
import { db } from '@/db';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { recordByCharacterId } from './recordByCharacterId';
import {
  NOTIFICATION_CHANNELS,
  type EventEnabledMap,
  type EveTypeEnabledMap,
} from './eventSelection';
import { isCharacterEventThresholds, type CharacterEventThresholds } from './eventThresholds';
import {
  SYNCED_NOTIFICATION_FEED_PREFS_KEY,
  withSyncedFeedPrefsApplied,
} from './syncedPreferences';

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
  /**
   * Per-`type` opt-out underneath the single `eveNotification` event (issue
   * #274), keyed separately from `perCharacter` because its per-type default
   * (feed-on/browser-off, `EVE_TYPE_DEFAULT`) is the opposite of
   * `perCharacter`'s absence-means-both-on idiom — a validator that treated
   * the two maps as interchangeable would read the wrong default for
   * whichever shape it guessed. Absent entirely means "nothing seen or
   * toggled for this character yet", not "everything off".
   */
  eveNotificationTypesByCharacter?: Record<number, EveTypeEnabledMap>;
  /**
   * The threshold controls the two corp events carry inline (issue #299):
   * structure fuel's lead time and the corp wallet's balance floor /
   * transaction ceiling. Keyed separately from `perCharacter` for the same
   * reason `eveNotificationTypesByCharacter` is — a different value shape,
   * not an on/off map. Synced (issue #363): a threshold that determines the
   * `fireAt` of an uploaded Projection is an input to shared state, not a
   * device preference — see `syncedPreferences.ts`.
   */
  thresholdsByCharacter?: Record<number, CharacterEventThresholds>;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesValue = {
  masterEnabled: true,
  perCharacter: {},
};

/** A bare boolean (written before channels existed) or a per-channel object. */
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

/**
 * Unlike `isEventChannelState` above, this rejects a bare boolean —
 * `eveNotificationTypesByCharacter` (issue #274) was introduced after the
 * channel split already existed, so it never needed the pre-channel legacy
 * shape. Keeping this a distinct predicate (not derived from the
 * boolean-accepting one) is what stops a previously-malformed stored value
 * from newly validating.
 */
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

function isNotificationPreferencesValue(raw: unknown): raw is NotificationPreferencesValue {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.masterEnabled === 'boolean' &&
    isOptionalBoolean(r.browserEnabled) &&
    isOptionalBoolean(r.feedEnabled) &&
    isPerCharacterMap(r.perCharacter) &&
    (r.eveNotificationTypesByCharacter === undefined ||
      isEveNotificationTypesByCharacter(r.eveNotificationTypesByCharacter)) &&
    (r.thresholdsByCharacter === undefined || isThresholdsByCharacter(r.thresholdsByCharacter))
  );
}

export const useNotificationPreferences = createLocalSetting<NotificationPreferencesValue>({
  key: NOTIFICATION_PREFS_SETTING_KEY,
  defaultValue: DEFAULT_NOTIFICATION_PREFERENCES,
  parse: (raw) => (isNotificationPreferencesValue(raw) ? raw : null),
});

/**
 * Hydrates the local preferences row, then splices in whatever synced feed
 * data (issue #363) sits in Dexie under `SYNCED_NOTIFICATION_FEED_PREFS_KEY`
 * — every reader of `useNotificationPreferences` should hydrate through this
 * rather than the store's own `hydrate()` directly, so a value pulled by a
 * sync (which writes straight to Dexie, bypassing this store) is reflected
 * the next time anything reads preferences, not just after a reload.
 */
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
  // withSyncedFeedPrefsApplied rebuilds a fresh object graph for every
  // Character present in the synced blob even when nothing actually
  // changed, so `merged !== current` is true on nearly every call — a
  // reference check here would call setValue every time this runs, and
  // both NotificationsPanel and the Alerts page re-run this (via
  // refreshAppBadge) from a `useEffect` keyed on the store's value,
  // which would then loop without end. A content comparison is what
  // actually tells "unchanged" from "changed".
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

/** Browser (OS) notifications on this device. Absent means on. */
export function isBrowserChannelEnabled(value: NotificationPreferencesValue): boolean {
  return value.browserEnabled ?? true;
}

/** The Overview's Notification Feed. Absent means on. */
export function isFeedChannelEnabled(value: NotificationPreferencesValue): boolean {
  return value.feedEnabled ?? true;
}

export function characterEveTypePrefs(
  value: NotificationPreferencesValue,
  characterId: number
): EveTypeEnabledMap {
  return value.eveNotificationTypesByCharacter?.[characterId] ?? {};
}
