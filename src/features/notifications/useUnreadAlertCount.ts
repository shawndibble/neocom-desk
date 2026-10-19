/**
 * How many alerts the bell panel would show right now — the number the bell's
 * badge carries.
 *
 * The same figure `refreshAppBadge` puts on the installed app's icon, and
 * deliberately so: two places claiming to count "unread alerts" and
 * disagreeing is worse than either being slightly wrong. `appBadge.ts` cannot
 * simply be reused — it is a one-shot async write to the Badging API, not a
 * subscription — so the *rule* is shared instead, via `visibleFeedEntries`.
 *
 * Device-wide, matching the page: the poller runs for every Character, and a
 * badge that hid an alt's alerts would be a badge you learn to distrust.
 */
import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { NotificationFeedRecord } from '@/db';
import type { AlertBadge } from '@/components/ui/unreadAlertsContext';
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

/**
 * The alerts the bell, panel and Danger banner all work from: the feed as the
 * Alerts rule shows it (undismissed, not muted, feed channel on), minus any
 * type snoozed on this device. Each caller opens its own live query, so only
 * the shell's badge hook runs it on every route.
 */
export function useVisibleAlertEntries(): NotificationFeedRecord[] {
  const prefs = useNotificationPreferences((state) => state.value);
  const snoozed = useSnoozeStore((state) => state.value);

  // Hydrated here, not relied on from elsewhere: the rail badge is on every route.
  useHydratedStore(useSnoozeStore);
  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  const entries = useLiveQuery(() => readFeed(), [], []);
  return useMemo(
    () =>
      !prefs.masterEnabled || !isFeedChannelEnabled(prefs)
        ? []
        : // eslint-disable-next-line react-hooks/purity -- a snooze ends by the wall clock; re-reading it on a feed, preference or snooze change is as fresh as the bell needs, and a minute ticker would re-render the whole shell
          withoutSnoozed(visibleFeedEntries(entries, prefs), snoozed, Date.now()),
    [entries, prefs, snoozed]
  );
}

/** The bell's badge: how many alerts wait, and whether one is danger. */
export function useAlertBadge(): AlertBadge {
  const entries = useVisibleAlertEntries();
  return useMemo(() => bellBadge(entries), [entries]);
}

export function useUnreadAlertCount(): number {
  return useAlertBadge().count;
}
