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
import { useLiveQuery } from 'dexie-react-hooks';
import { readFeed } from './feed';
import { visibleFeedEntries } from './feedSelection';
import { useNotificationPreferences, isFeedChannelEnabled } from './preferences';

export function useUnreadAlertCount(): number {
  const prefs = useNotificationPreferences((state) => state.value);
  const entries = useLiveQuery(() => readFeed(), [], []);
  if (!prefs.masterEnabled || !isFeedChannelEnabled(prefs)) return 0;
  return visibleFeedEntries(entries, prefs).length;
}
