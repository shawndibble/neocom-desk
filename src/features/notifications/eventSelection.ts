/**
 * Pure per-character Notification Event toggle helpers: every event is on by
 * default (CONTEXT.md round 20), so absence from the map means enabled, not
 * unset — mirroring `assetSelection.ts`'s tri-state shape but keyed by event
 * id with a default-true map instead of a `Set` of selected ids.
 */
import type { SelectionState } from '@/features/character/assetSelection';
import type { NotificationEventId } from './events';

export type EventEnabledMap = Partial<Record<NotificationEventId, boolean>>;

export function isEventEnabled(map: EventEnabledMap, eventId: NotificationEventId): boolean {
  return map[eventId] ?? true;
}

export function selectionStateForEvents(
  eventIds: readonly NotificationEventId[],
  map: EventEnabledMap
): SelectionState {
  if (eventIds.length === 0) return 'unchecked';
  const enabledCount = eventIds.filter((id) => isEventEnabled(map, id)).length;
  if (enabledCount === 0) return 'unchecked';
  return enabledCount === eventIds.length ? 'checked' : 'indeterminate';
}

/** Checking a section cascades to every listed event at once — checked or indeterminate both fill in to fully enabled; only a fully-enabled section clears. */
export function toggleAllEvents(
  eventIds: readonly NotificationEventId[],
  map: EventEnabledMap
): EventEnabledMap {
  const allEnabled = eventIds.length > 0 && eventIds.every((id) => isEventEnabled(map, id));
  const next: EventEnabledMap = { ...map };
  for (const id of eventIds) next[id] = !allEnabled;
  return next;
}
