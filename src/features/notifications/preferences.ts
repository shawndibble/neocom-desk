import { setSyncedSetting, scheduleSync } from '@/sync';
import { quietHoursPayload } from './quietTime';
import { scheduleProjectionRebuild } from './projectionRebuildScheduler';
import {
  isEventEnabledFor,
  toggleEventChannel,
  isEveTypeEnabledFor,
  toggleEveTypeChannel,
  broadcastEventChannelFlags,
  broadcastEveTypeChannelFlags,
  broadcastAllEveTypesChannelFlags,
  type EventEnabledMap,
  type EveTypeEnabledMap,
  type NotificationChannel,
  NOTIFICATION_CHANNELS,
} from './eventSelection';
import type { NotificationEventId } from './events';
import {
  DEFAULT_EXTRACTOR_EXPIRING_LEAD_HOURS,
  DEFAULT_COURIER_DELIVERY_DUE_LEAD_HOURS,
  DEFAULT_CONTRACT_EXPIRING_LEAD_HOURS,
  DEFAULT_ORDERS_LAPSING_LEAD_HOURS,
  DEFAULT_MERCENARY_DEN_REINFORCED_LEAD_HOURS,
  DEFAULT_ACCELERATOR_EXPIRING_LEAD_HOURS,
  DEFAULT_SKYHOOK_RAIDABLE_LEAD_HOURS,
  DEFAULT_SKYHOOK_RAIDABLE_MIN_UNITS,
  DEFAULT_SHARED_MOON_POP_LEAD_MINUTES,
  DEFAULT_SKILL_QUEUE_ENDING_LEAD_HOURS,
  DEFAULT_STRUCTURE_FUEL_LOW_DAYS,
  defaultedThresholds,
  type CharacterEventThresholds,
} from './eventThresholdFields';
import type { EntryChannelTarget } from './feedSelection';
import { SYNCED_NOTIFICATION_FEED_PREFS_KEY, toSyncedFeedPrefs } from './syncedPreferences';
import {
  useNotificationPreferences,
  characterEventPrefs,
  characterEveTypePrefs,
  isBrowserChannelEnabled,
  mutedSharedPopCorporations,
  type NotificationPreferencesValue,
} from './preferencesStore';

export {
  NOTIFICATION_PREFS_SETTING_KEY,
  DEFAULT_NOTIFICATION_PREFERENCES,
  useNotificationPreferences,
  hydrateNotificationPreferences,
  characterEventPrefs,
  characterEveTypePrefs,
  isBrowserChannelEnabled,
  isFeedChannelEnabled,
  isDismissOnView,
  mutedSharedPopCorporations,
  type NotificationPreferencesValue,
} from './preferencesStore';
export type { CharacterEventThresholds } from './eventThresholdFields';
export {
  STRUCTURE_FUEL_LOW_DAY_OPTIONS,
  EXTRACTOR_EXPIRING_LEAD_HOUR_OPTIONS,
  SKILL_QUEUE_ENDING_LEAD_HOUR_OPTIONS,
  COURIER_DELIVERY_DUE_LEAD_HOUR_OPTIONS,
  DEFAULT_STRUCTURE_FUEL_LOW_DAYS,
  DEFAULT_EXTRACTOR_EXPIRING_LEAD_HOURS,
  DEFAULT_SKILL_QUEUE_ENDING_LEAD_HOURS,
  DEFAULT_COURIER_DELIVERY_DUE_LEAD_HOURS,
  DEFAULT_CONTRACT_EXPIRING_LEAD_HOURS,
  DEFAULT_ORDERS_LAPSING_LEAD_HOURS,
  DEFAULT_CORP_WALLET_BALANCE_FLOOR_ISK,
  DEFAULT_CORP_WALLET_TRANSACTION_CEILING_ISK,
  DEFAULT_WALLET_BALANCE_CHANGED_THRESHOLD_ISK,
  DEFAULT_WALLET_FOLD_INTO_CONTRACT,
  DEFAULT_INCURSION_NEARBY_JUMPS,
  DEFAULT_SKYHOOK_RAIDABLE_NEARBY_JUMPS,
  DEFAULT_SHIP_LOST_MINIMUM_ISK,
  DEFAULT_MERCENARY_DEN_REINFORCED_LEAD_HOURS,
  DEFAULT_ACCELERATOR_EXPIRING_LEAD_HOURS,
  DEFAULT_MERCENARY_DEN_ANARCHY_PERCENT,
  DEFAULT_SKYHOOK_RAIDABLE_LEAD_HOURS,
  DEFAULT_SKYHOOK_RAIDABLE_MIN_UNITS,
} from './eventThresholdFields';

const DEFAULT_PROJECTION_ENTRY = JSON.stringify([
  [],
  [],
  DEFAULT_STRUCTURE_FUEL_LOW_DAYS,
  DEFAULT_EXTRACTOR_EXPIRING_LEAD_HOURS,
  DEFAULT_SKILL_QUEUE_ENDING_LEAD_HOURS,
  DEFAULT_COURIER_DELIVERY_DUE_LEAD_HOURS,
  DEFAULT_CONTRACT_EXPIRING_LEAD_HOURS,
  DEFAULT_ORDERS_LAPSING_LEAD_HOURS,
  DEFAULT_MERCENARY_DEN_REINFORCED_LEAD_HOURS,
  DEFAULT_ACCELERATOR_EXPIRING_LEAD_HOURS,
  DEFAULT_SKYHOOK_RAIDABLE_LEAD_HOURS,
  DEFAULT_SKYHOOK_RAIDABLE_MIN_UNITS,
  DEFAULT_SHARED_MOON_POP_LEAD_MINUTES,
]);

function projectionInputs(value: NotificationPreferencesValue): string {
  const characters: Record<string, unknown> = {};
  const ids = new Set([
    ...Object.keys(value.perCharacter),
    ...Object.keys(value.eveNotificationTypesByCharacter ?? {}),
    ...Object.keys(value.thresholdsByCharacter ?? {}),
  ]);
  for (const id of ids) {
    const characterId = Number(id);
    const events = characterEventPrefs(value, characterId);
    const eveTypes = characterEveTypePrefs(value, characterId);
    const eventsOffDefault = Object.keys(events)
      .filter((key) => {
        const eventId = key as NotificationEventId;
        return (
          isEventEnabledFor(events, eventId, 'browser') !==
          isEventEnabledFor({}, eventId, 'browser')
        );
      })
      .sort();
    const eveTypesOffDefault = Object.keys(eveTypes)
      .filter(
        (type) =>
          isEveTypeEnabledFor(eveTypes, type, 'browser') !==
          isEveTypeEnabledFor({}, type, 'browser')
      )
      .sort();
    const {
      structureFuelLowDays,
      extractorExpiringLeadHours,
      skillQueueEndingLeadHours,
      courierDeliveryDueLeadHours,
      contractExpiringLeadHours,
      ordersLapsingLeadHours,
      mercenaryDenReinforcedLeadHours,
      acceleratorExpiringLeadHours,
      skyhookRaidableLeadHours,
      skyhookRaidableMinUnits,
      sharedMoonPopLeadMinutes,
    } = characterEventThresholds(value, characterId);
    const entry = JSON.stringify([
      eventsOffDefault,
      eveTypesOffDefault,
      structureFuelLowDays,
      extractorExpiringLeadHours,
      skillQueueEndingLeadHours,
      courierDeliveryDueLeadHours,
      contractExpiringLeadHours,
      ordersLapsingLeadHours,
      mercenaryDenReinforcedLeadHours,
      acceleratorExpiringLeadHours,
      skyhookRaidableLeadHours,
      skyhookRaidableMinUnits,
      sharedMoonPopLeadMinutes,
    ]);
    if (entry !== DEFAULT_PROJECTION_ENTRY) characters[id] = entry;
  }
  return JSON.stringify([
    value.masterEnabled,
    isBrowserChannelEnabled(value),
    characters,
    quietHoursPayload(value),
    [...mutedSharedPopCorporations(value)].sort((a, b) => a - b),
  ]);
}

function writeLocalPrefs(
  next: NotificationPreferencesValue,
  persist: () => Promise<void>
): Promise<void> {
  const changesProjection =
    projectionInputs(useNotificationPreferences.getState().value) !== projectionInputs(next);
  const write = persist();
  if (changesProjection) scheduleProjectionRebuild(write);
  return write;
}

export function setDeviceNotificationPrefs(next: NotificationPreferencesValue): Promise<void> {
  return writeLocalPrefs(next, () => useNotificationPreferences.getState().setValue(next));
}

export function updateNotificationPrefs(
  characterId: number,
  next: NotificationPreferencesValue,
  channel?: NotificationChannel
): Promise<void> {
  return writeLocalPrefs(next, async () => {
    await useNotificationPreferences.getState().setValue(next);
    if (channel === 'browser') return;
    await setSyncedSetting(SYNCED_NOTIFICATION_FEED_PREFS_KEY, toSyncedFeedPrefs(next));
    scheduleSync(characterId, { collections: ['settings'] });
  });
}

export function withSharedPopCorporationMuted(
  value: NotificationPreferencesValue,
  corporationId: number,
  muted: boolean
): NotificationPreferencesValue {
  const others = (value.mutedSharedPopCorporations ?? []).filter((id) => id !== corporationId);
  return { ...value, mutedSharedPopCorporations: muted ? [...others, corporationId] : others };
}

export function setSharedPopCorporationMuted(
  characterIds: readonly number[],
  corporationId: number,
  muted: boolean
): Promise<void> {
  const next = withSharedPopCorporationMuted(
    useNotificationPreferences.getState().value,
    corporationId,
    muted
  );
  return writeLocalPrefs(next, async () => {
    await useNotificationPreferences.getState().setValue(next);
    await setSyncedSetting(SYNCED_NOTIFICATION_FEED_PREFS_KEY, toSyncedFeedPrefs(next));
    for (const characterId of characterIds)
      scheduleSync(characterId, { collections: ['settings'] });
  });
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

export function withDismissOnView(
  value: NotificationPreferencesValue,
  dismissOnView: boolean
): NotificationPreferencesValue {
  return { ...value, dismissOnView };
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

export async function toggleEventChannelPref(
  characterId: number,
  value: NotificationPreferencesValue,
  eventId: NotificationEventId,
  channel: NotificationChannel
): Promise<void> {
  await updateNotificationPrefs(
    characterId,
    withEventChannelToggled(value, characterId, eventId, channel),
    channel
  );
}

export async function toggleEveTypeChannelPref(
  characterId: number,
  value: NotificationPreferencesValue,
  type: string,
  channel: NotificationChannel
): Promise<void> {
  await updateNotificationPrefs(
    characterId,
    withEveNotificationTypeToggled(value, characterId, type, channel),
    channel
  );
}

export async function setMutedForCharacters(
  characterIds: readonly number[],
  target: EntryChannelTarget,
  muted: boolean,
  channels: readonly NotificationChannel[] = NOTIFICATION_CHANNELS
): Promise<void> {
  for (const characterId of characterIds) {
    for (const channel of channels) {
      const value = useNotificationPreferences.getState().value;
      const isMuted =
        target.kind === 'eveType'
          ? !isEveTypeEnabledFor(characterEveTypePrefs(value, characterId), target.type, channel)
          : !isEventEnabledFor(characterEventPrefs(value, characterId), target.eventId, channel);
      if (isMuted === muted) continue;
      if (target.kind === 'eveType') {
        await toggleEveTypeChannelPref(characterId, value, target.type, channel);
      } else {
        await toggleEventChannelPref(characterId, value, target.eventId, channel);
      }
    }
  }
}

export function setFeedMutedForCharacters(
  characterIds: readonly number[],
  target: EntryChannelTarget,
  muted: boolean
): Promise<void> {
  return setMutedForCharacters(characterIds, target, muted, ['feed']);
}

export function isNotTrainingAlertEnabledFor(
  value: NotificationPreferencesValue,
  characterId: number
): boolean {
  return isEventEnabledFor(characterEventPrefs(value, characterId), 'characterNotTraining', 'feed');
}

export function characterEventThresholds(
  value: NotificationPreferencesValue,
  characterId: number
): Required<CharacterEventThresholds> {
  return defaultedThresholds(value.thresholdsByCharacter?.[characterId] ?? {});
}

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

async function writeBroadcastFlags(
  field: 'perCharacter' | 'eveNotificationTypesByCharacter',
  characterIds: readonly number[],
  value: NotificationPreferencesValue,
  flags: Record<number, EventEnabledMap> | Record<number, EveTypeEnabledMap>,
  channel: NotificationChannel
): Promise<void> {
  if (characterIds.length === 0) return;
  const next: NotificationPreferencesValue = {
    ...value,
    [field]: { ...value[field], ...flags },
  };
  await updateNotificationPrefs(characterIds[0], next, channel);
}

export async function broadcastEventChannelPref(
  characterIds: readonly number[],
  value: NotificationPreferencesValue,
  eventId: NotificationEventId,
  channel: NotificationChannel
): Promise<void> {
  await writeBroadcastFlags(
    'perCharacter',
    characterIds,
    value,
    broadcastEventChannelFlags(characterIds, eventId, value.perCharacter, channel),
    channel
  );
}

export async function broadcastEveTypeChannelPref(
  characterIds: readonly number[],
  value: NotificationPreferencesValue,
  type: string,
  channel: NotificationChannel
): Promise<void> {
  await writeBroadcastFlags(
    'eveNotificationTypesByCharacter',
    characterIds,
    value,
    broadcastEveTypeChannelFlags(
      characterIds,
      type,
      value.eveNotificationTypesByCharacter ?? {},
      channel
    ),
    channel
  );
}

export async function broadcastAllEveTypesChannelPref(
  characterIds: readonly number[],
  value: NotificationPreferencesValue,
  types: readonly string[],
  channel: NotificationChannel
): Promise<void> {
  await writeBroadcastFlags(
    'eveNotificationTypesByCharacter',
    characterIds,
    value,
    broadcastAllEveTypesChannelFlags(
      characterIds,
      types,
      value.eveNotificationTypesByCharacter ?? {},
      channel
    ),
    channel
  );
}

export { isEventEnabledFor, isEveTypeEnabledFor };
