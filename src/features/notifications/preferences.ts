/**
 * Notification preferences: device-local (CONTEXT.md round 20, same category
 * as font scale / Market's Location Mode) — never synced, since the browser
 * permission this eventually gates is itself per-device. One master switch
 * gates everything; below it, every Notification Event is independently
 * toggleable per Character, on by default (absence from a character's map
 * means enabled — see `eventSelection.ts`).
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import {
  isEventEnabledFor,
  toggleEventChannel,
  toggleAllEventsOnChannel,
  isEveTypeEnabledFor,
  toggleEveTypeChannel,
  NOTIFICATION_CHANNELS,
  type EventEnabledMap,
  type EveTypeEnabledMap,
  type NotificationChannel,
} from './eventSelection';
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
   * not an on/off map. Device-local like the rest of this store (this
   * module's own doc comment): AC4 asks for "per Character and per device",
   * which is exactly what a `createLocalSetting`-backed field already is.
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
}

/** The three lead times `structureFuelLow`'s inline control offers (issue #299) — CCP's own alert fires separately and later. */
export const STRUCTURE_FUEL_LOW_DAY_OPTIONS: readonly number[] = [7, 3, 1];

/** A week's warning is the issue's own justification: "a director planning a fuel run wants a week's warning." */
export const DEFAULT_STRUCTURE_FUEL_LOW_DAYS = 7;
export const DEFAULT_CORP_WALLET_BALANCE_FLOOR_ISK = 50_000_000;
export const DEFAULT_CORP_WALLET_TRANSACTION_CEILING_ISK = 100_000_000;

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
    isOptionalFiniteNumber(r.corpWalletTransactionCeilingIsk)
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
