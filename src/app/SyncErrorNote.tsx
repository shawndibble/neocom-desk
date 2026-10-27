import { useTranslation } from 'react-i18next';
import type { SyncStatus } from '@/sync';
import { LiveStatus } from '@/components/ui/LiveStatus';
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
 * It surfaces mid-session off a background event, so a screen reader needs a
 * live region: an always-mounted `LiveStatus` is filled when the error appears
 * (a region inserted together with its text is not reliably announced). The
 * visible `<p>` carries no role, so the text is not read twice.
 */
export function SyncErrorNote({ status, online }: SyncErrorNoteProps) {
  const { t } = useTranslation();
  const failed = syncDisplayState(status, online) === 'error';
  return (
    <>
      <LiveStatus>{failed && t('sync.errorNote')}</LiveStatus>
      {failed && (
        <p className="mb-4 text-[0.6875rem] text-danger uppercase">{t('sync.errorNote')}</p>
      )}
    </>
  );
}
