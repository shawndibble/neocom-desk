/**
 * Notification preferences: device-local by default (GLOSSARY.md round 20,
 * same category as font scale / Market's Location Mode), since the browser
 * permission the master switch and browser channel eventually gate is itself
 * per-device. One master switch gates everything; below it, every
 * Notification Event is independently toggleable per Character, on by
 * default (absence from a character's map means enabled — see
 * `eventSelection.ts`).
 *
 * The **feed** half of those per-Character toggles, plus the structure-fuel
 * and corp-wallet thresholds, are the exception (GLOSSARY.md round 44/45,
 * issue #363): nothing about the feed is device-gated, so those sync —
 * `hydrateNotificationPreferences` below splices the synced slice in on top
 * of this store's own local row. See `syncedPreferences.ts`.
 */
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
  DEFAULT_SKYHOOK_RAIDABLE_LEAD_HOURS,
  DEFAULT_SKYHOOK_RAIDABLE_MIN_UNITS,
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
  type NotificationPreferencesValue,
} from './preferencesStore';

// The read side lives in `preferencesStore.ts` so the Service Worker can
// import it without this file's `@/sync` writers — see that file's header.
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
  type NotificationPreferencesValue,
} from './preferencesStore';
export type { CharacterEventThresholds } from './eventThresholdFields';
/** Re-export so preferences importers needn't reach `eventThresholdFields.ts`. */
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
  DEFAULT_MERCENARY_DEN_ANARCHY_PERCENT,
  DEFAULT_SKYHOOK_RAIDABLE_LEAD_HOURS,
  DEFAULT_SKYHOOK_RAIDABLE_MIN_UNITS,
} from './eventThresholdFields';

/**
 * The slice of preferences the uploaded Projection reads (`projectionRebuild.ts`),
 * normalized so "absent" and "set to the default" compare equal: the master
 * switch, the browser gate, each Character's browser-channel opinions,
 * and the lead-time thresholds a projecting domain uses. Feed flags and the
 * wallet thresholds feed no upload, so they are left out.
 */
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
  DEFAULT_SKYHOOK_RAIDABLE_LEAD_HOURS,
  DEFAULT_SKYHOOK_RAIDABLE_MIN_UNITS,
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
    // Keys whose browser flag differs from that key's own default (some
    // events and most EVE types default browser-off).
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
      skyhookRaidableLeadHours,
      skyhookRaidableMinUnits,
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
      skyhookRaidableLeadHours,
      skyhookRaidableMinUnits,
    ]);
    // An all-default Character reads the same as an absent one.
    if (entry !== DEFAULT_PROJECTION_ENTRY) characters[id] = entry;
  }
  // Quiet time rides the same upload as the Projection, so a change re-uploads.
  return JSON.stringify([
    value.masterEnabled,
    isBrowserChannelEnabled(value),
    characters,
    quietHoursPayload(value),
  ]);
}

/**
 * Writes `next` to the local store, and schedules a coalesced Projection
 * rebuild when it changes anything the upload reads (issue #1259) — every
 * preference write goes through here, so no call site can forget it. The
 * scheduler gets the write itself, so the rebuild waits for it to settle.
 */
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

/**
 * Device-local-only writes: the master switch and the browser/feed channel
 * gates. None of that belongs on the wire, so no sync push — but the master
 * switch and browser gate still change what the Projection uploads.
 */
export function setDeviceNotificationPrefs(next: NotificationPreferencesValue): Promise<void> {
  return writeLocalPrefs(next, () => useNotificationPreferences.getState().setValue(next));
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
 * Shared by `NotificationsPanel` (Settings) and the feed's mute
 * (issue #364) so the sync-vs-local branching lives in one place.
 */
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

/**
 * Toggles one event's channel and writes it in one call — `channel` is
 * stated once rather than passed to `withEventChannelToggled` and then again
 * to `updateNotificationPrefs`'s own `channel` argument, which used to let a
 * caller's two copies silently disagree (nothing checked that a browser
 * toggle's builder call and its write call named the same channel). The
 * two toggle pairs below and `updateNotificationPrefs` itself are the only
 * way a caller should apply a channel toggle; a threshold write has no
 * channel and keeps calling `updateNotificationPrefs` directly, since it
 * always syncs.
 */
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

/**
 * Silence (or restore) one notification type for several Characters at once,
 * on the given delivery channels.
 *
 * A `set`, not a toggle, and that is the whole reason it exists. A type is one
 * row spanning every Character it fired for, and those Characters can disagree
 * about it: one muted from a context menu months ago, the rest not. Looping the
 * existing `toggle*ChannelPref` over them would flip each independently and leave
 * the row in the *inverted* mixed state it started in. Passing the intended end
 * state instead makes the row's own reading of itself ("muted" = muted for all of
 * them) the thing that changes. The same holds per channel: a type already off
 * for `browser` stays off, rather than being flipped back on.
 *
 * Sequential, re-reading the store between writes: `updateNotificationPrefs`
 * takes a whole next value, so a parallel fan-out would have every write build
 * on the same pre-loop snapshot and only the last would survive. A `browser`
 * write stays on the device (`updateNotificationPrefs`), a `feed` write syncs.
 *
 * `characterIds[0]` drives the sync scheduling, so put a signed-in Character
 * (the active one) first.
 */
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

/** The same, for the **feed** channel alone — what the Alerts page's per-type row does. */
export function setFeedMutedForCharacters(
  characterIds: readonly number[],
  target: EntryChannelTarget,
  muted: boolean
): Promise<void> {
  return setMutedForCharacters(characterIds, target, muted, ['feed']);
}

/** Whether this Character would actually raise `characterNotTraining` in the Feed — its one per-pilot opt-out (issue #1731), read by the Overview board and Characters page so neither can disagree with the alert itself. */
export function isNotTrainingAlertEnabledFor(
  value: NotificationPreferencesValue,
  characterId: number
): boolean {
  return isEventEnabledFor(characterEventPrefs(value, characterId), 'characterNotTraining', 'feed');
}

/** One Character's thresholds, defaulted (issue #299) — the shape both the settings row and the poller read. */
export function characterEventThresholds(
  value: NotificationPreferencesValue,
  characterId: number
): Required<CharacterEventThresholds> {
  return defaultedThresholds(value.thresholdsByCharacter?.[characterId] ?? {});
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

/**
 * Writes a batch of already-computed per-Character flags into `field` (issue
 * #738, #745) — the shared shell both broadcast functions below reduce to.
 * `characterIds[0]` drives `updateNotificationPrefs`'s sync scheduling;
 * callers put the active Character first so this is always a signed-in
 * Character with a usable token, not just Dexie's insertion order
 * (`NotificationsPanel.tsx`'s `allCharacterIds`).
 */
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

/**
 * Broadcasts one event's channel value to every known Character at once
 * (issue #738) — the event-first list's row-level control. A
 * one-time broadcast to Characters that exist right now, not a saved default
 * applied to ones added later; each can still be edited independently
 * afterward.
 */
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

/**
 * Broadcasts one EVE Notification type's channel value to every known
 * Character at once (issue #745) — the EVE type rows'
 * control underneath `eveNotification`, same one-time-broadcast contract as
 * `broadcastEventChannelPref`.
 */
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

/** Same as `broadcastEveTypeChannelPref`, for a Family's own select-all across every Character too. */
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

/** Re-exported so callers gate on one import rather than reaching into eventSelection too. */
export { isEventEnabledFor, isEveTypeEnabledFor };
