import { captureMessage } from '@sentry/react';
import { onUpgradeBlocked } from '@/db/blockedSignal';

/**
 * Report a blocked IndexedDB upgrade to Sentry; returns an unsubscribe.
 *
 * Wired from the shell — `src/db` cannot import Sentry itself (see
 * `blockedSignal.ts`). A report, not a recovery; `captureMessage` is a no-op
 * without a DSN.
 */
export function subscribeToUpgradeBlockedReports(): () => void {
  return onUpgradeBlocked(({ oldVersion, newVersion }) => {
    // Dexie's own default handler reads a missing or lower `newVersion` as a
    // blocked `Dexie.delete` rather than a blocked upgrade; match it, so the
    // message never names the wrong operation.
    const blockedDelete = !newVersion || newVersion < oldVersion;
    // Native IndexedDB version numbers, which are Dexie's times ten: a Dexie
    // v10 -> v11 block reports 100 -> 110. Reported raw so the value matches
    // what the browser and any IndexedDB tooling show.
    captureMessage(
      blockedDelete
        ? 'IndexedDB delete blocked by another connection'
        : 'IndexedDB upgrade blocked by another connection',
      { level: 'warning', tags: { subsystem: 'boot' }, extra: { oldVersion, newVersion } }
    );
  });
}
