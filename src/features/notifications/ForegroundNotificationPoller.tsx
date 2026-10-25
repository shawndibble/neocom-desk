import { useEffect } from 'react';
import {
  runForegroundPoll,
  liveDependencies,
  FIRST_POLL_DELAY_MS,
  POLL_INTERVAL_MS,
} from './foregroundPoller';
import { refreshAppBadge } from './appBadge';
import { joinTabElection, runUnlessRunningElsewhere } from '@/lib/tabLeader';
import { ignoreIdbTeardown } from '@/db/teardown';
import { isOnline, onReconnect } from '@/stores/network';

/**
 * Mounts the Foreground Poller (GLOSSARY.md round 20): renders nothing, just
 * runs a poll every `POLL_INTERVAL_MS` while the tab is the Tab Leader
 * (`lib/tabLeader.ts` — one tab polls for all of them). It keeps polling while
 * hidden (issue #5120): a player who switches apps for a few minutes still gets
 * device pop-ups, for as long as the browser lets a background page run. An
 * immediate catch-up check runs on regaining visibility — and
 * shortly after mount (`FIRST_POLL_DELAY_MS`), since opening the app is itself
 * the strongest case of "becoming visible", just not one worth contending
 * with the first route's own reads for. Mounted once in `Layout`, beside `NotificationPermissionPrompt`;
 * `runForegroundPoll` (features/notifications/foregroundPoller.ts) owns every
 * decision about whether a poll actually does anything.
 */
export function ForegroundNotificationPoller() {
  // App-icon badge on open. Feed writes and dismissals keep it current from
  // then on (`feed.ts`), but a cold start needs it restored once — and the
  // Overview panel cannot do it, since the app may open on any route.
  useEffect(() => {
    void refreshAppBadge();
  }, []);

  useEffect(() => {
    let cancelled = false;
    /** Whether the boot hold-off is over — taking leadership must not skip it. */
    let firstPollDue = false;

    // Leadership arrives a beat after `visibilitychange` (the lock is granted
    // asynchronously), so the catch-up below finds this tab not yet leader —
    // hence a catch-up on taking leadership over, too.
    const seat = joinTabElection('poller', () => {
      if (firstPollDue) poll();
    });

    function poll() {
      // Offline, every domain would just fail into its cached row: nothing new
      // can be found. The reconnect catch-up below makes up for the missed ticks.
      if (cancelled || !isOnline() || !seat.isLeader()) return;
      // A new leader's catch-up must not overlap the old leader's poll still
      // in flight: both would fire, and feed, the same occurrences. A poll cut
      // short by iOS aborting its IndexedDB transactions (the tab went to the
      // background mid-save) is just a missed tick — the next one redoes it.
      void ignoreIdbTeardown(
        runUnlessRunningElsewhere('neocom:poll', () => runForegroundPoll(liveDependencies()))
      );
    }

    const firstPoll = setTimeout(() => {
      firstPollDue = true;
      poll();
    }, FIRST_POLL_DELAY_MS);
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    function onVisibilityChange() {
      if (!document.hidden) poll();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Back online: catch up now rather than at the next interval tick.
    const offReconnect = onReconnect(() => {
      if (firstPollDue) poll();
    });

    return () => {
      offReconnect();
      seat.leave();
      cancelled = true;
      clearTimeout(firstPoll);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
