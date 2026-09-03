/**
 * Pure per-character Notification Event toggle helpers.
 *
 * Every event is on by default (CONTEXT.md round 20), so absence from the map
 * means enabled, not unset — mirroring `assetSelection.ts`'s tri-state shape
 * but keyed by event id with a default-true map instead of a `Set`.
 *
 * A toggle is now **per delivery channel**: an event can raise a browser
 * notification but stay out of the Overview feed, or the reverse. The two are
 * genuinely different appetites — a wallet tick worth a row on a dashboard is
 * not necessarily worth interrupting someone for.
 *
 * `EventChannelState` accepts a bare boolean as well as the per-channel
 * object, because that is exactly what preferences written before channels
 * existed contain. A stored `false` meant "not at all", so it reads as false
 * for both channels; absence still reads as true for both. Normalising on
 * read rather than migrating on write means a device that downgrades does not
 * lose its settings.
 */
import type { SelectionState } from '@/features/character/assetSelection';
import type { NotificationEventId } from './events';

export const NOTIFICATION_CHANNELS = ['browser', 'feed'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Per-channel flags, or a legacy bare boolean meaning "both channels". */
export type EventChannelState = boolean | Partial<Record<NotificationChannel, boolean>>;

export type EventEnabledMap = Partial<Record<NotificationEventId, EventChannelState>>;

export function isEventEnabledFor(
  map: EventEnabledMap,
  eventId: NotificationEventId,
  channel: NotificationChannel
): boolean {
  const state = map[eventId];
  if (state === undefined) return true;
  if (typeof state === 'boolean') return state;
  return state[channel] ?? true;
}

/** Enabled on at least one channel — i.e. worth fetching this event's data at all. */
export function isEventEnabledOnAnyChannel(
  map: EventEnabledMap,
  eventId: NotificationEventId
): boolean {
  return NOTIFICATION_CHANNELS.some((channel) => isEventEnabledFor(map, eventId, channel));
}

export function selectionStateForEvents(
  eventIds: readonly NotificationEventId[],
  map: EventEnabledMap,
  channel: NotificationChannel
): SelectionState {
  if (eventIds.length === 0) return 'unchecked';
  const enabledCount = eventIds.filter((id) => isEventEnabledFor(map, id, channel)).length;
  if (enabledCount === 0) return 'unchecked';
  return enabledCount === eventIds.length ? 'checked' : 'indeterminate';
}

/** Flips one event on one channel, preserving whatever the other channel said. */
export function toggleEventChannel(
  map: EventEnabledMap,
  eventId: NotificationEventId,
  channel: NotificationChannel
): EventEnabledMap {
  const next: Partial<Record<NotificationChannel, boolean>> = {};
  for (const c of NOTIFICATION_CHANNELS) next[c] = isEventEnabledFor(map, eventId, c);
  next[channel] = !next[channel];
  return { ...map, [eventId]: next };
}

/**
 * Column select-all: cascades over one channel only — checked or
 * indeterminate both fill in to fully enabled; only a fully-enabled column
 * clears. The other channel's flags are carried through untouched.
 */
export function toggleAllEventsOnChannel(
  eventIds: readonly NotificationEventId[],
  map: EventEnabledMap,
  channel: NotificationChannel
): EventEnabledMap {
  const allEnabled =
    eventIds.length > 0 && eventIds.every((id) => isEventEnabledFor(map, id, channel));
  const next: EventEnabledMap = { ...map };
  for (const id of eventIds) {
    const flags: Partial<Record<NotificationChannel, boolean>> = {};
    for (const c of NOTIFICATION_CHANNELS) flags[c] = isEventEnabledFor(map, id, c);
    flags[channel] = !allEnabled;
    next[id] = flags;
  }
  return next;
}
