import { useTranslation } from 'react-i18next';
import type { SyncStatus } from '@/sync';
import { syncDisplayState } from './syncStatus';

interface SyncErrorNoteProps {
  status: SyncStatus;
  online: boolean;
}

/**
 * Visible (not tooltip-only) "Sync error" text for pages where a silent
 * failure risks looking like data loss — e.g. /skills/plans, where local
 * edits keep working even when sync can't reach Firebase (UX-REVIEW #1/#10:
 * the nav's SyncStatusDot is hover-only, which reads as "red = broken" with
 * no visible words). Renders nothing outside the error state.
 */
export function SyncErrorNote({ status, online }: SyncErrorNoteProps) {
  const { t } = useTranslation();
  if (syncDisplayState(status, online) !== 'error') return null;
  return <p className="text-[0.6875rem] text-danger uppercase">{t('sync.errorNote')}</p>;
}
