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

  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  const entries = useLiveQuery(() => readFeed(), [], []);
  if (!prefs.masterEnabled || !isFeedChannelEnabled(prefs)) return new Map();
  return alertCountsByCharacter(visibleFeedEntries(entries, prefs));
}
