import { useEffect } from 'react';
import { ignoreIdbTeardown } from '@/db/teardown';
import { joinTabElection, runUnlessRunningElsewhere } from '@/lib/tabLeader';
import { recordAllNetWorthSnapshots } from './recordSnapshots';

/** Boot hold-off: the first route's own reads go first. */
export const FIRST_SNAPSHOT_DELAY_MS = 20 * 1000;
/** How often the once-a-day check re-runs; the check itself is a single Dexie read per Character. */
export const SNAPSHOT_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Mounts the daily Net Worth Snapshot (issue #2865): renders nothing. Only the
 * Tab Leader writes (the same election the Foreground Poller stands in), and a
 * Web Lock keeps a leadership handover from running two at once. A tab left
 * open past midnight UTC records the new day on its next check.
 * Mounted once in `Layout`.
 */
export function NetWorthSnapshotRecorder() {
  useEffect(() => {
    let cancelled = false;
    const seat = joinTabElection('poller', () => {});
    function run() {
      if (cancelled || !seat.isLeader()) return;
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
