import { useEffect } from 'react';
import {
  runForegroundPoll,
  liveDependencies,
  FIRST_POLL_DELAY_MS,
  POLL_INTERVAL_MS,
  regainPollDue,
} from './foregroundPoller';
import { refreshAppBadge } from './appBadge';
import { joinTabElection, runUnlessRunningElsewhere } from '@/lib/tabLeader';
import { ignoreIdbTeardown } from '@/db/teardown';
import { isOnline, onReconnect } from '@/stores/network';

export function ForegroundNotificationPoller() {
  useEffect(() => {
    void refreshAppBadge();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let firstPollDue = false;

    const seat = joinTabElection('poller', () => {
      if (firstPollDue) poll();
    });

    let lastPollAt: number | null = null;

    function poll() {
      if (cancelled || !isOnline() || !seat.isLeader()) return;
      lastPollAt = Date.now();
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
      if (!document.hidden && regainPollDue(lastPollAt, Date.now())) poll();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

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
