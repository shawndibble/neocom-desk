/**
 * How many alerts the Alerts page would show right now — the number the rail's
 * badge and the Overview's alerts column both carry.
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
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { readFeed } from './feed';
import { visibleFeedEntries } from './feedSelection';
import {
  hydrateNotificationPreferences,
  isFeedChannelEnabled,
  useNotificationPreferences,
} from './preferences';

export function useUnreadAlertCount(): number {
  const prefs = useNotificationPreferences((state) => state.value);

  /*
   * Hydrated here rather than relied on from elsewhere. The Overview's old
   * feed panel used to do it on the one route that showed alerts; this badge
   * is in the rail, so it is on every route, and the only other hydrator is
   * the Foreground Poller — which is not this hook's dependency and should not
   * quietly become one. `hydrate` returns early once done, so the extra call
   * costs nothing.
   */
  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  const entries = useLiveQuery(() => readFeed(), [], []);
  if (!prefs.masterEnabled || !isFeedChannelEnabled(prefs)) return 0;
  return visibleFeedEntries(entries, prefs).length;
}
