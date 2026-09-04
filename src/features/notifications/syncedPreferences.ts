/**
 * The synced slice of Notification Preferences (issue #363, CONTEXT.md round
 * 44/45): the **feed** half of every per-Character event/eve-type toggle, and
 * the corp/structure thresholds, cross-device. Everything else in
 * `preferences.ts` — the master switch, the browser channel, and the browser
 * half of those same toggles — stays device-local, since the permission it
 * gates is itself per-device.
 *
 * `mergeSettings` (`src/sync/merge.ts`) is whole-value last-write-wins per
 * key, so this is one key carrying every Character's feed data, not one key
 * per Character: `SYNCED_SETTING_KEYS` is an exact-match allow-list, and a
 * per-Character key scheme can't be expressed in it without weakening that
 * allow-list into a prefix match. The accepted trade: two devices editing
 * *different* Characters' feed prefs concurrently, both before a sync, can
 * have one edit clobber the other. Rare (it takes two devices open on the
 * same account at once) and no worse than the pre-existing single-row local
 * model this mirrors.
 *
 * These functions are pure — no Dexie/fetch — so the actual read (Dexie) and
 * write (`setSyncedSetting`) live in `preferences.ts` and `NotificationsPanel.tsx`.
 */
import {
  isEventEnabledFor,
  isEveTypeEnabledFor,
  type EventEnabledMap,
  type EveTypeEnabledMap,
} from './eventSelection';
import type { NotificationEventId } from './events';
import type { CharacterEventThresholds, NotificationPreferencesValue } from './preferences';

export const SYNCED_NOTIFICATION_FEED_PREFS_KEY = 'sync.notificationFeedPrefs';

export interface SyncedFeedPrefs {
  perCharacter: Record<number, Partial<Record<NotificationEventId, boolean>>>;
  eveNotificationTypesByCharacter: Record<number, Record<string, boolean>>;
  thresholdsByCharacter: Record<number, CharacterEventThresholds>;
}

// ---------------------------------------------------------------------------
// Extraction (local -> synced blob)
// ---------------------------------------------------------------------------

/**
 * Feed-channel flags only, and only where explicitly set. A legacy bare
 * boolean applied to both channels, so it counts as an explicit feed value
 * too. An event never touched (absent, or set on `browser` alone) is omitted
 * rather than materialized to its default — the default is shared code both
 * devices already run, so shipping it would just be noise, and would wrongly
 * pin a future default change to whatever value happened to sync first.
 */
function extractFeedFromEventMap(
  map: EventEnabledMap
): Partial<Record<NotificationEventId, boolean>> {
  const result: Partial<Record<NotificationEventId, boolean>> = {};
  for (const [eventIdRaw, state] of Object.entries(map)) {
    const eventId = eventIdRaw as NotificationEventId;
    if (state === undefined) continue;
    if (typeof state === 'boolean') {
      result[eventId] = state;
    } else if (state.feed !== undefined) {
      result[eventId] = state.feed;
    }
  }
  return result;
}

function extractFeedFromEveTypeMap(map: EveTypeEnabledMap): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [type, state] of Object.entries(map)) {
    if (state.feed !== undefined) result[type] = state.feed;
  }
  return result;
}

/** Only the fields actually set for this Character — never an `undefined` value (Firestore rejects those). */
function extractThresholds(raw: CharacterEventThresholds | undefined): CharacterEventThresholds {
  const result: CharacterEventThresholds = {};
  if (raw?.structureFuelLowDays !== undefined)
    result.structureFuelLowDays = raw.structureFuelLowDays;
  if (raw?.corpWalletBalanceFloorIsk !== undefined) {
    result.corpWalletBalanceFloorIsk = raw.corpWalletBalanceFloorIsk;
  }
  if (raw?.corpWalletTransactionCeilingIsk !== undefined) {
    result.corpWalletTransactionCeilingIsk = raw.corpWalletTransactionCeilingIsk;
  }
  return result;
}

/** The full local preferences value, reduced to the slice `SYNCED_NOTIFICATION_FEED_PREFS_KEY` carries. */
export function toSyncedFeedPrefs(value: NotificationPreferencesValue): SyncedFeedPrefs {
  const perCharacter: Record<number, Partial<Record<NotificationEventId, boolean>>> = {};
  for (const [characterIdRaw, map] of Object.entries(value.perCharacter)) {
    const feed = extractFeedFromEventMap(map);
    if (Object.keys(feed).length > 0) perCharacter[Number(characterIdRaw)] = feed;
  }

  const eveNotificationTypesByCharacter: Record<number, Record<string, boolean>> = {};
  for (const [characterIdRaw, map] of Object.entries(value.eveNotificationTypesByCharacter ?? {})) {
    const feed = extractFeedFromEveTypeMap(map);
    if (Object.keys(feed).length > 0)
      eveNotificationTypesByCharacter[Number(characterIdRaw)] = feed;
  }

  const thresholdsByCharacter: Record<number, CharacterEventThresholds> = {};
  for (const [characterIdRaw, raw] of Object.entries(value.thresholdsByCharacter ?? {})) {
    const thresholds = extractThresholds(raw);
    if (Object.keys(thresholds).length > 0)
      thresholdsByCharacter[Number(characterIdRaw)] = thresholds;
  }

  return { perCharacter, eveNotificationTypesByCharacter, thresholdsByCharacter };
}

// ---------------------------------------------------------------------------
// Validation of a value pulled off the wire
// ---------------------------------------------------------------------------

function isBooleanMap(raw: unknown): raw is Record<string, boolean> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.values(raw as Record<string, unknown>).every((v) => typeof v === 'boolean');
}

function isBooleanMapByCharacter(raw: unknown): raw is Record<number, Record<string, boolean>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isBooleanMap(value)
  );
}

function isOptionalFiniteNumber(raw: unknown): boolean {
  return raw === undefined || (typeof raw === 'number' && Number.isFinite(raw));
}

function isThresholds(raw: unknown): raw is CharacterEventThresholds {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return (
    isOptionalFiniteNumber(r.structureFuelLowDays) &&
    isOptionalFiniteNumber(r.corpWalletBalanceFloorIsk) &&
    isOptionalFiniteNumber(r.corpWalletTransactionCeilingIsk)
  );
}

function isThresholdsByCharacter(raw: unknown): raw is Record<number, CharacterEventThresholds> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isThresholds(value)
  );
}

function isSyncedFeedPrefs(raw: unknown): raw is SyncedFeedPrefs {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    isBooleanMapByCharacter(r.perCharacter) &&
    isBooleanMapByCharacter(r.eveNotificationTypesByCharacter) &&
    isThresholdsByCharacter(r.thresholdsByCharacter)
  );
}

// ---------------------------------------------------------------------------
// Merge (synced blob -> local value)
// ---------------------------------------------------------------------------

/**
 * Writes synced feed values into a copy of `local`, sourcing the browser
 * flag from `local` itself so a remote device's browser-channel choice (or a
 * remote legacy bare boolean, which implies one) never crosses over.
 */
function mergeFeedIntoEventMap(
  local: EventEnabledMap,
  feed: Partial<Record<NotificationEventId, boolean>>
): EventEnabledMap {
  const next: EventEnabledMap = { ...local };
  for (const [eventIdRaw, feedValue] of Object.entries(feed)) {
    if (feedValue === undefined) continue;
    const eventId = eventIdRaw as NotificationEventId;
    next[eventId] = { browser: isEventEnabledFor(local, eventId, 'browser'), feed: feedValue };
  }
  return next;
}

function mergeFeedIntoEveTypeMap(
  local: EveTypeEnabledMap,
  feed: Record<string, boolean>
): EveTypeEnabledMap {
  const next: EveTypeEnabledMap = { ...local };
  for (const [type, feedValue] of Object.entries(feed)) {
    next[type] = { browser: isEveTypeEnabledFor(local, type, 'browser'), feed: feedValue };
  }
  return next;
}

/**
 * Applies a synced feed-prefs blob (as pulled from Dexie under
 * `SYNCED_NOTIFICATION_FEED_PREFS_KEY`) onto a local preferences value.
 * `synced` is `unknown` because it came off the wire — a malformed or
 * unrecognized shape degrades to `value` unchanged rather than throwing or
 * corrupting local state.
 */
export function withSyncedFeedPrefsApplied(
  value: NotificationPreferencesValue,
  synced: unknown
): NotificationPreferencesValue {
  if (!isSyncedFeedPrefs(synced)) return value;

  let next = value;

  for (const [characterIdRaw, feed] of Object.entries(synced.perCharacter)) {
    const characterId = Number(characterIdRaw);
    const localMap = next.perCharacter[characterId] ?? {};
    next = {
      ...next,
      perCharacter: { ...next.perCharacter, [characterId]: mergeFeedIntoEventMap(localMap, feed) },
    };
  }

  for (const [characterIdRaw, feed] of Object.entries(synced.eveNotificationTypesByCharacter)) {
    const characterId = Number(characterIdRaw);
    const localMap = next.eveNotificationTypesByCharacter?.[characterId] ?? {};
    next = {
      ...next,
      eveNotificationTypesByCharacter: {
        ...next.eveNotificationTypesByCharacter,
        [characterId]: mergeFeedIntoEveTypeMap(localMap, feed),
      },
    };
  }

  for (const [characterIdRaw, thresholds] of Object.entries(synced.thresholdsByCharacter)) {
    const characterId = Number(characterIdRaw);
    const localThresholds = next.thresholdsByCharacter?.[characterId] ?? {};
    next = {
      ...next,
      thresholdsByCharacter: {
        ...next.thresholdsByCharacter,
        [characterId]: { ...localThresholds, ...thresholds },
      },
    };
  }

  return next;
}
