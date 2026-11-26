import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { NotificationFeedRecord } from '@/db';
import type { AlertBadge } from '@/components/ui/unreadAlertsContext';
import { useTicker } from '@/lib/ticker';
import { bellBadge } from './dangerAlert';
import { readFeed } from './feed';
import { visibleFeedEntries } from './feedSelection';
import {
  hydrateNotificationPreferences,
  isFeedChannelEnabled,
  useNotificationPreferences,
} from './preferences';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useSnoozeStore, withoutSnoozed } from './snooze';
import { MINUTE_MS } from '@/lib/age';

export function useVisibleAlertEntries(): NotificationFeedRecord[] {
  const prefs = useNotificationPreferences((state) => state.value);
  const snoozed = useSnoozeStore((state) => state.value);
  const now = useTicker(MINUTE_MS);

  useHydratedStore(useSnoozeStore);
  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  const entries = useLiveQuery(() => readFeed(), [], []);
  const visible = useMemo(
    () =>
      !prefs.masterEnabled || !isFeedChannelEnabled(prefs)
        ? []
        : withoutSnoozed(visibleFeedEntries(entries, prefs), snoozed, now),
    [entries, prefs, snoozed, now]
  );
  const [held, setHeld] = useState(visible);
  if (held === visible || sameEntries(held, visible)) return held;
  setHeld(visible);
  return visible;
}

const sameEntries = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((entry, i) => entry === b[i]);

export function useAlertBadge(): AlertBadge {
  const entries = useVisibleAlertEntries();
  return useMemo(() => bellBadge(entries), [entries]);
}

export function useUnreadAlertCount(): number {
  return useAlertBadge().count;
}
