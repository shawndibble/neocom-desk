import { useTranslation } from 'react-i18next';
import type { SyncStatus } from '@/sync';
import { syncDisplayState } from './syncStatus';

interface SyncErrorNoteProps {
  status: SyncStatus;
  online: boolean;
}

/**
 * Visible (not tooltip-only) "Sync error" text, mounted once at the shell
 * level by `Layout.tsx`'s `SyncErrorBanner` so it speaks from every route
 * (#1132) rather than from `/skills/plans` alone, as it did when UX-REVIEW
 * #1/#10 first added it. Local edits keep working even when sync can't reach
 * Firebase, so a silent failure otherwise looks like data loss; the nav's
 * `SyncStatusDot` is hover-only, which reads as "red = broken" with no
 * visible words, and is desktop-only besides. Renders nothing outside the
 * error state.
 */
export function SyncErrorNote({ status, online }: SyncErrorNoteProps) {
  const { t } = useTranslation();
  if (syncDisplayState(status, online) !== 'error') return null;
  return <p className="text-[0.6875rem] text-danger uppercase">{t('sync.errorNote')}</p>;
}
