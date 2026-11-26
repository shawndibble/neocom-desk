import { captureMessage } from '@sentry/react';
import { onUpgradeBlocked } from '@/db/blockedSignal';

export function subscribeToUpgradeBlockedReports(): () => void {
  return onUpgradeBlocked(({ oldVersion, newVersion }) => {
    const blockedDelete = !newVersion || newVersion < oldVersion;
    captureMessage(
      blockedDelete
        ? 'IndexedDB delete blocked by another connection'
        : 'IndexedDB upgrade blocked by another connection',
      { level: 'warning', tags: { subsystem: 'boot' }, extra: { oldVersion, newVersion } }
    );
  });
}
