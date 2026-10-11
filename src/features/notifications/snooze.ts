/**
 * Snooze for an alert type: hide a group for an hour on this device.
 *
 * Device-local on purpose (`createLocalSetting`, no feed field, nothing
 * synced): a snooze is "not now, here", and the entries stay in the feed
 * untouched so it ends by the clock alone. Only price alerts offer it
 * (`dangerAlert.isSnoozable`).
 *
 * The map is keyed by `alertGroupKey` and holds the epoch ms the snooze ends.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { alertGroupKey } from './alertGroups';
import type { NotificationFeedRecord } from '@/db';

export const SNOOZE_MS = 60 * 60 * 1000;

export type SnoozeMap = Readonly<Record<string, number>>;

export function snooze(
  map: SnoozeMap,
  groupKey: string,
  now: number,
  durationMs: number = SNOOZE_MS
): SnoozeMap {
  return { ...map, [groupKey]: now + durationMs };
}

export function isSnoozed(map: SnoozeMap, groupKey: string, now: number): boolean {
  const until = map[groupKey];
  return until !== undefined && now < until;
}

export function pruneExpired(map: SnoozeMap, now: number): SnoozeMap {
  return Object.fromEntries(Object.entries(map).filter(([, until]) => now < until));
}

/** The entries whose type is not currently snoozed. */
export function withoutSnoozed<T extends Pick<NotificationFeedRecord, 'eventId' | 'eveType'>>(
  entries: readonly T[],
  map: SnoozeMap,
  now: number
): T[] {
  return entries.filter((entry) => !isSnoozed(map, alertGroupKey(entry), now));
}

export function parseSnoozeMap(raw: unknown): SnoozeMap | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return Object.fromEntries(
    Object.entries(raw).filter(
      (pair): pair is [string, number] => typeof pair[1] === 'number' && Number.isFinite(pair[1])
    )
  );
}

export const useSnoozeStore = createLocalSetting<SnoozeMap>({
  key: 'notifications.snoozedGroups',
  defaultValue: {},
  parse: parseSnoozeMap,
});
