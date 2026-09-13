import { captureMessage } from '@sentry/react';
import { onUpgradeBlocked } from '@/db/blockedSignal';

/**
 * Report a blocked IndexedDB upgrade to Sentry; returns an unsubscribe.
 *
 * Wired from the shell so `src/db` keeps no dependency on Sentry — it is
 * imported by the service worker, which must not carry the React SDK
 * (docs/ARCHITECTURE.md §2, same reasoning as the ESI signals).
 *
 * This is a report, not a recovery: Dexie's own defaults already close the
 * other connection and warn. The block is otherwise invisible — the open
 * request never rejects, so nothing reaches an error handler and the app just
 * sits on `BootScreen`. `captureMessage` is a no-op without a DSN.
 */
export function subscribeToUpgradeBlockedReports(): () => void {
  return onUpgradeBlocked(({ oldVersion, newVersion }) => {
    // Native IndexedDB version numbers, which are Dexie's times ten: a Dexie
    // v10 -> v11 block reports 100 -> 110. Reported raw rather than divided so
    // the value matches what the browser and any IndexedDB tooling show.
    captureMessage('IndexedDB upgrade blocked by another connection', {
      level: 'warning',
      extra: { oldVersion, newVersion },
    });
  });
}
