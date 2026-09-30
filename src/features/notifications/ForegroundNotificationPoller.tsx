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

/**
 * Mounts the Foreground Poller (CONTEXT.md round 20): renders nothing, just
 * runs a poll every `POLL_INTERVAL_MS` while the tab is visible *and* the Tab
 * Leader (`lib/tabLeader.ts` — one tab polls for all of them), paused while
 * hidden, with an immediate catch-up check on regaining visibility — and
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
      if (cancelled || document.hidden || !seat.isLeader()) return;
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

    return () => {
      seat.leave();
      cancelled = true;
      clearTimeout(firstPoll);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
