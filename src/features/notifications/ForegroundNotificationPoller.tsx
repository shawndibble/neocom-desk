import { useEffect } from 'react';
import {
  runForegroundPoll,
  liveDependencies,
  FIRST_POLL_DELAY_MS,
  POLL_INTERVAL_MS,
} from './foregroundPoller';
import { refreshAppBadge } from './appBadge';

/**
 * Mounts the Foreground Poller (CONTEXT.md round 20): renders nothing, just
 * runs a poll every `POLL_INTERVAL_MS` while the tab is visible, paused while
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

    function poll() {
      if (cancelled || document.hidden) return;
      void runForegroundPoll(liveDependencies());
    }

    const firstPoll = setTimeout(poll, FIRST_POLL_DELAY_MS);
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    function onVisibilityChange() {
      if (!document.hidden) poll();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearTimeout(firstPoll);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
