import {
  isEventEnabledFor,
  isEveTypeEnabledFor,
  type EventEnabledMap,
  type EveTypeEnabledMap,
} from './eventSelection';
import type { NotificationEventId } from './events';
import type { NotificationPreferencesValue } from './preferencesStore';
import { isCorporationIdList } from './corporationIdList';
import { setThresholds, type CharacterEventThresholds } from './eventThresholdFields';
import { recordByCharacterId } from './recordByCharacterId';

export const SYNCED_NOTIFICATION_FEED_PREFS_KEY = 'sync.notificationFeedPrefs';

export interface SyncedFeedPrefs {
  perCharacter: Record<number, Partial<Record<NotificationEventId, boolean>>>;
  eveNotificationTypesByCharacter: Record<number, Record<string, boolean>>;
  thresholdsByCharacter: Record<number, CharacterEventThresholds>;
  mutedSharedPopCorporations?: number[];
}

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
    const thresholds = setThresholds(raw);
    if (Object.keys(thresholds).length > 0)
      thresholdsByCharacter[Number(characterIdRaw)] = thresholds;
  }

  return {
    perCharacter,
    eveNotificationTypesByCharacter,
    thresholdsByCharacter,
    ...(value.mutedSharedPopCorporations === undefined
      ? {}
      : { mutedSharedPopCorporations: [...value.mutedSharedPopCorporations] }),
  };
}

function isBooleanMap(raw: unknown): raw is Record<string, boolean> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Object.values(raw as Record<string, unknown>).every((v) => typeof v === 'boolean');
}

const isBooleanMapByCharacter = recordByCharacterId(isBooleanMap);

function isOptionalFiniteNumber(raw: unknown): boolean {
  return raw === undefined || (typeof raw === 'number' && Number.isFinite(raw));
}

function isThresholds(raw: unknown): raw is CharacterEventThresholds {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return (
    isOptionalFiniteNumber(r.structureFuelLowDays) &&
    isOptionalFiniteNumber(r.extractorExpiringLeadHours) &&
    isOptionalFiniteNumber(r.skillQueueEndingLeadHours) &&
    isOptionalFiniteNumber(r.acceleratorExpiringLeadHours) &&
    isOptionalFiniteNumber(r.courierDeliveryDueLeadHours) &&
    isOptionalFiniteNumber(r.contractExpiringLeadHours) &&
    isOptionalFiniteNumber(r.ordersLapsingLeadHours) &&
    isOptionalFiniteNumber(r.mercenaryDenReinforcedLeadHours) &&
    isOptionalFiniteNumber(r.mercenaryDenAnarchyPercent) &&
    isOptionalFiniteNumber(r.skyhookRaidableLeadHours) &&
    isOptionalFiniteNumber(r.skyhookRaidableMinUnits) &&
    isOptionalFiniteNumber(r.sharedMoonPopLeadMinutes) &&
    isOptionalFiniteNumber(r.corpWalletBalanceFloorIsk) &&
    isOptionalFiniteNumber(r.corpWalletTransactionCeilingIsk) &&
    isOptionalFiniteNumber(r.walletBalanceChangedThresholdIsk) &&
    isOptionalFiniteNumber(r.walletFoldIntoContract) &&
    isOptionalFiniteNumber(r.incursionNearbyJumps) &&
    isOptionalFiniteNumber(r.skyhookRaidableNearbyJumps) &&
    isOptionalFiniteNumber(r.shipLostMinimumIsk)
  );
}

const isThresholdsByCharacter = recordByCharacterId(isThresholds);

function isSyncedFeedPrefs(raw: unknown): raw is SyncedFeedPrefs {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    isBooleanMapByCharacter(r.perCharacter) &&
    isBooleanMapByCharacter(r.eveNotificationTypesByCharacter) &&
    isThresholdsByCharacter(r.thresholdsByCharacter) &&
    (r.mutedSharedPopCorporations === undefined ||
      isCorporationIdList(r.mutedSharedPopCorporations))
  );
}

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

  if (synced.mutedSharedPopCorporations !== undefined) {
    next = { ...next, mutedSharedPopCorporations: [...synced.mutedSharedPopCorporations] };
  }

  return next;
}
