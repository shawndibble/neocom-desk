import { useEffect } from 'react';
import { ignoreIdbTeardown } from '@/db/teardown';
import { joinTabElection, runUnlessRunningElsewhere } from '@/lib/tabLeader';
import { recordAllNetWorthSnapshots } from './recordSnapshots';

export const FIRST_SNAPSHOT_DELAY_MS = 20 * 1000;
export const SNAPSHOT_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function NetWorthSnapshotRecorder() {
  useEffect(() => {
    let cancelled = false;
    const seat = joinTabElection('poller', () => {});
    function run() {
      if (cancelled || document.visibilityState !== 'visible' || !seat.isLeader()) return;
      void ignoreIdbTeardown(
        runUnlessRunningElsewhere('neocom:netWorth', () => recordAllNetWorthSnapshots())
      );
    }
    const first = setTimeout(run, FIRST_SNAPSHOT_DELAY_MS);
    const interval = setInterval(run, SNAPSHOT_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      seat.leave();
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);
  return null;
}
