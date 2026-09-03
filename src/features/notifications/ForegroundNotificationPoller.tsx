import { useEffect } from 'react';
import { runForegroundPoll, liveDependencies, POLL_INTERVAL_MS } from './foregroundPoller';
import { refreshAppBadge } from './feed';

/**
 * Mounts the Foreground Poller (CONTEXT.md round 20): renders nothing, just
 * runs a poll every `POLL_INTERVAL_MS` while the tab is visible, paused while
 * hidden, with an immediate catch-up check on regaining visibility — and on
 * mount, since opening the app is itself the strongest case of "becoming
 * visible". Mounted once in `Layout`, beside `NotificationPermissionPrompt`;
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

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    function onVisibilityChange() {
      if (!document.hidden) poll();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
