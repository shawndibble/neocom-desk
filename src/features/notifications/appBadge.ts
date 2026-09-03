/**
 * Keeps the app-icon badge in step with the Overview feed.
 *
 * Its own module rather than a function on `feed.ts`: it uses one thing from
 * storage (`readFeed`) and three from elsewhere — the preference store, the
 * visibility rules, and the Badging API — so hosting it in `feed.ts` dragged
 * all three into what is otherwise a clean storage module, and put `feed.ts`
 * and `feedSelection.ts` in an import cycle. `badge.ts` stays deliberately
 * dumb (it takes a number and nothing else); this is the piece that knows
 * what the number means.
 */
import { setAppBadgeCount } from './badge';
import { readFeed } from './feed';
import { visibleFeedEntries } from './feedSelection';
import { useNotificationPreferences, isFeedChannelEnabled } from './preferences';

/**
 * Re-derives the badge from what the Overview would actually show: the same
 * visibility filter the panel applies, across every Character, and nothing at
 * all when the feed channel or the master switch is off.
 *
 * Called after every feed mutation, and from both Settings and the Overview
 * when a *preference* changes rather than an entry — Settings is a different
 * route, so the Overview panel's own effect never runs for a change made
 * there.
 */
export async function refreshAppBadge(): Promise<void> {
  await useNotificationPreferences.getState().hydrate();
  const prefs = useNotificationPreferences.getState().value;
  if (!prefs.masterEnabled || !isFeedChannelEnabled(prefs)) {
    await setAppBadgeCount(0);
    return;
  }
  await setAppBadgeCount(visibleFeedEntries(await readFeed(), prefs).length);
}
