import { useTranslation } from 'react-i18next';
import type { SyncStatus } from '@/sync';
import { syncDisplayState } from './syncStatus';

interface SyncErrorNoteProps {
  status: SyncStatus;
  online: boolean;
}

/**
 * Visible (not tooltip-only) "Sync error" text. Local edits keep working even
 * when sync can't reach Firebase, so a silent failure looks like data loss,
 * and the nav's `SyncStatusDot` is hover-only — "red = broken" with no words
 * (UX-REVIEW #1/#10). Renders nothing outside the error state; `Layout.tsx`'s
 * `SyncErrorBanner` owns where it is mounted.
 *
 * `role="status"`: it surfaces mid-session off a background event, so without
 * a live region a screen reader is never told — the form the planner's and
 * Settings' confirmations already use.
 */
export function SyncErrorNote({ status, online }: SyncErrorNoteProps) {
  const { t } = useTranslation();
  if (syncDisplayState(status, online) !== 'error') return null;
  return (
    <p role="status" aria-live="polite" className="text-[0.6875rem] text-danger uppercase">
      {t('sync.errorNote')}
    </p>
  );
}
