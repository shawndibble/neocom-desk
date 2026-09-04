/**
 * Notification preferences: device-local by default (CONTEXT.md round 20,
 * same category as font scale / Market's Location Mode), since the browser
 * permission the master switch and browser channel eventually gate is itself
 * per-device. One master switch gates everything; below it, every
 * Notification Event is independently toggleable per Character, on by
 * default (absence from a character's map means enabled — see
 * `eventSelection.ts`).
 *
 * The **feed** half of those per-Character toggles, plus the structure-fuel
 * and corp-wallet thresholds, are the exception (CONTEXT.md round 44/45,
 * issue #363): nothing about the feed is device-gated, so those sync —
 * `hydrateNotificationPreferences` below splices the synced slice in on top
 * of this store's own local row. See `syncedPreferences.ts`.
 */
import { db } from '@/db';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { setSyncedSetting, scheduleSync } from '@/sync';
import {
  isEventEnabledFor,
  toggleEventChannel,
  toggleAllEventsOnChannel,
  isEveTypeEnabledFor,
  toggleEveTypeChannel,
  toggleAllEveTypesOnChannel,
  NOTIFICATION_CHANNELS,
  type EventEnabledMap,
  type EveTypeEnabledMap,
  type NotificationChannel,
} from './eventSelection';
import type { NotificationEventId } from './events';
import {
  SYNCED_NOTIFICATION_FEED_PREFS_KEY,
  withSyncedFeedPrefsApplied,
  toSyncedFeedPrefs,
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

/** One Character's threshold settings. Absent fields read as their default (below). */
export interface CharacterEventThresholds {
  /** Days of fuel remaining that trigger `structureFuelLow` — one of `STRUCTURE_FUEL_LOW_DAY_OPTIONS`. */
  structureFuelLowDays?: number;
  /** ISK balance at or under which `corpWalletThreshold` fires its `balanceBelow` half. */
  corpWalletBalanceFloorIsk?: number;
  /** ISK amount a single journal entry must exceed to fire `corpWalletThreshold`'s `transactionAbove` half. */
  corpWalletTransactionCeilingIsk?: number;
  /** Absolute ISK amount a single wallet journal entry must reach to fire `walletBalanceChanged`. */
  walletBalanceChangedThresholdIsk?: number;
}

/** The three lead times `structureFuelLow`'s inline control offers (issue #299) — CCP's own alert fires separately and later. */
export const STRUCTURE_FUEL_LOW_DAY_OPTIONS: readonly number[] = [7, 3, 1];

/** A week's warning is the issue's own justification: "a director planning a fuel run wants a week's warning." */
export const DEFAULT_STRUCTURE_FUEL_LOW_DAYS = 7;
export const DEFAULT_CORP_WALLET_BALANCE_FLOOR_ISK = 50_000_000;
export const DEFAULT_CORP_WALLET_TRANSACTION_CEILING_ISK = 100_000_000;
export const DEFAULT_WALLET_BALANCE_CHANGED_THRESHOLD_ISK = 1_000_000;

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

function isPerCharacterMap(raw: unknown): raw is Record<number, EventEnabledMap> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isEventEnabledMap(value)
  );
}

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

function isEveNotificationTypesByCharacter(raw: unknown): raw is Record<number, EveTypeEnabledMap> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isEveTypeEnabledMap(value)
  );
}

function isOptionalBoolean(raw: unknown): boolean {
  return raw === undefined || typeof raw === 'boolean';
}

function isOptionalFiniteNumber(raw: unknown): boolean {
  return raw === undefined || (typeof raw === 'number' && Number.isFinite(raw));
}

function isCharacterEventThresholds(raw: unknown): raw is CharacterEventThresholds {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return (
    isOptionalFiniteNumber(r.structureFuelLowDays) &&
    isOptionalFiniteNumber(r.corpWalletBalanceFloorIsk) &&
    isOptionalFiniteNumber(r.corpWalletTransactionCeilingIsk) &&
    isOptionalFiniteNumber(r.walletBalanceChangedThresholdIsk)
  );
}

function isThresholdsByCharacter(raw: unknown): raw is Record<number, CharacterEventThresholds> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.entries(raw as Record<string, unknown>).every(
    ([key, value]) => !Number.isNaN(Number(key)) && isCharacterEventThresholds(value)
  );
}

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
  // both NotificationsPanel and NotificationFeedPanel re-run this (via
  // refreshAppBadge) from a `useEffect` keyed on the store's value,
  // which would then loop without end. A content comparison is what
  // actually tells "unchanged" from "changed".
  if (JSON.stringify(merged) !== JSON.stringify(current)) {
    await useNotificationPreferences.getState().setValue(merged);
  }
}

/**
 * Writes a preference change and, unless it only touched the device-local
 * browser channel, pushes the feed-only slice to the synced setting (issue
 * #363) and schedules a sync. `setSyncedSetting` itself leaves scheduling to
 * the caller.
 *
 * `channel` names which delivery channel this particular write touched, for
 * callers driven by a per-channel control (a threshold write has no channel
 * — it always syncs). A `'browser'` write must skip the sync push entirely,
 * not just contribute nothing to `toSyncedFeedPrefs`: pushing still stamps
 * `sync.notificationFeedPrefs`'s LWW `updatedAt`, so a browser-only edit
 * would otherwise be able to clobber a genuine, still-unsynced feed edit
 * made concurrently on another device.
 *
 * Shared by `NotificationsPanel` (Settings) and `NotificationContextMenu`
 * (issue #364) so the sync-vs-local branching lives in one place.
 */
export async function updateNotificationPrefs(
  characterId: number,
  next: NotificationPreferencesValue,
  channel?: NotificationChannel
): Promise<void> {
  await useNotificationPreferences.getState().setValue(next);
  if (channel === 'browser') return;
  await setSyncedSetting(SYNCED_NOTIFICATION_FEED_PREFS_KEY, toSyncedFeedPrefs(next));
  scheduleSync(characterId);
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

export function withEventChannelToggled(
  value: NotificationPreferencesValue,
  characterId: number,
  eventId: NotificationEventId,
  channel: NotificationChannel
): NotificationPreferencesValue {
  const prefs = characterEventPrefs(value, characterId);
  return {
    ...value,
    perCharacter: {
      ...value.perCharacter,
      [characterId]: toggleEventChannel(prefs, eventId, channel),
    },
  };
}

export function withAllEventsToggledForCharacter(
  value: NotificationPreferencesValue,
  characterId: number,
  eventIds: readonly NotificationEventId[],
  channel: NotificationChannel
): NotificationPreferencesValue {
  const prefs = characterEventPrefs(value, characterId);
  return {
    ...value,
    perCharacter: {
      ...value.perCharacter,
      [characterId]: toggleAllEventsOnChannel(eventIds, prefs, channel),
    },
  };
}

export function characterEveTypePrefs(
  value: NotificationPreferencesValue,
  characterId: number
): EveTypeEnabledMap {
  return value.eveNotificationTypesByCharacter?.[characterId] ?? {};
}

export function withEveNotificationTypeToggled(
  value: NotificationPreferencesValue,
  characterId: number,
  type: string,
  channel: NotificationChannel
): NotificationPreferencesValue {
  const prefs = characterEveTypePrefs(value, characterId);
  return {
    ...value,
    eveNotificationTypesByCharacter: {
      ...value.eveNotificationTypesByCharacter,
      [characterId]: toggleEveTypeChannel(prefs, type, channel),
    },
  };
}

/** Family header select-all/none for one Character (issue #352). */
export function withAllEveTypesToggledForCharacter(
  value: NotificationPreferencesValue,
  characterId: number,
  types: readonly string[],
  channel: NotificationChannel
): NotificationPreferencesValue {
  const prefs = characterEveTypePrefs(value, characterId);
  return {
    ...value,
    eveNotificationTypesByCharacter: {
      ...value.eveNotificationTypesByCharacter,
      [characterId]: toggleAllEveTypesOnChannel(types, prefs, channel),
    },
  };
}

/** One Character's thresholds, defaulted (issue #299) — the shape both the settings row and the poller read. */
export function characterEventThresholds(
  value: NotificationPreferencesValue,
  characterId: number
): Required<CharacterEventThresholds> {
  const raw = value.thresholdsByCharacter?.[characterId] ?? {};
  return {
    structureFuelLowDays: raw.structureFuelLowDays ?? DEFAULT_STRUCTURE_FUEL_LOW_DAYS,
    corpWalletBalanceFloorIsk:
      raw.corpWalletBalanceFloorIsk ?? DEFAULT_CORP_WALLET_BALANCE_FLOOR_ISK,
    corpWalletTransactionCeilingIsk:
      raw.corpWalletTransactionCeilingIsk ?? DEFAULT_CORP_WALLET_TRANSACTION_CEILING_ISK,
    walletBalanceChangedThresholdIsk:
      raw.walletBalanceChangedThresholdIsk ?? DEFAULT_WALLET_BALANCE_CHANGED_THRESHOLD_ISK,
  };
}

/** Sets one threshold field for one Character, preserving the others (issue #299). */
export function withCharacterEventThreshold<K extends keyof CharacterEventThresholds>(
  value: NotificationPreferencesValue,
  characterId: number,
  key: K,
  amount: number
): NotificationPreferencesValue {
  const existing = value.thresholdsByCharacter?.[characterId] ?? {};
  return {
    ...value,
    thresholdsByCharacter: {
      ...value.thresholdsByCharacter,
      [characterId]: { ...existing, [key]: amount },
    },
  };
}

/** Re-exported so callers gate on one import rather than reaching into eventSelection too. */
export { isEventEnabledFor, isEveTypeEnabledFor };
