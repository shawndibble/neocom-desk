import { useTranslation } from 'react-i18next';
import type { SyncStatus } from '@/sync';
import { syncDisplayState } from './syncStatus';

interface SyncErrorNoteProps {
  status: SyncStatus;
  online: boolean;
}

/**
 * Visible (not tooltip-only) "Sync error" text. Local edits keep working even
 * when sync can't reach Firebase, so a silent failure looks like data loss.
 * See `Layout.tsx`'s `SyncErrorBanner` for why the nav's dot alone isn't
 * enough and where this is mounted. Renders nothing outside the error state,
 * carrying its own `mb-4` so the absent case takes no space (as
 * `AuthFailureNotice` does).
 *
 * `role="status"`: it surfaces mid-session off a background event, so without
 * a live region a screen reader is never told — the form the planner's and
 * Settings' confirmations already use.
 */
export function SyncErrorNote({ status, online }: SyncErrorNoteProps) {
  const { t } = useTranslation();
  if (syncDisplayState(status, online) !== 'error') return null;
  return (
    <p role="status" aria-live="polite" className="mb-4 text-[0.6875rem] text-danger uppercase">
      {t('sync.errorNote')}
    </p>
  );
}
