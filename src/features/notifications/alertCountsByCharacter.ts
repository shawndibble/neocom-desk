/**
 * How many visible alerts each character has right now — the per-character
 * badge on the Characters table view. Same visibility rule as the rail's
 * badge (`useUnreadAlertCount.ts`): two counts both claiming to be "alerts"
 * and disagreeing would be worse than either being slightly wrong.
 *
 * Pure grouping, no fetch/DOM/Dexie — the hook below is the impure boundary.
 */
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { NotificationFeedRecord } from '@/db';
import { readFeed } from './feed';
import { visibleFeedEntries } from './feedSelection';
import {
  hydrateNotificationPreferences,
  isFeedChannelEnabled,
  useNotificationPreferences,
} from './preferences';

/** Absent from the map means zero, same as every other entry not listed here. */
export function alertCountsByCharacter(
  entries: readonly NotificationFeedRecord[]
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    counts.set(entry.characterId, (counts.get(entry.characterId) ?? 0) + 1);
  }
  return counts;
}

export function useAlertCountsByCharacter(): Map<number, number> {
  const prefs = useNotificationPreferences((state) => state.value);

  // Same rationale as useUnreadAlertCount.ts: hydrated here since this hook
  // may be the only thing on a route reading Notification Preferences.
  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  const entries = useLiveQuery(() => readFeed(), [], []);
  if (!prefs.masterEnabled || !isFeedChannelEnabled(prefs)) return new Map();
  return alertCountsByCharacter(visibleFeedEntries(entries, prefs));
}
