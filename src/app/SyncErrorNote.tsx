import { useTranslation } from 'react-i18next';
import type { SyncStatus } from '@/sync';
import { LiveStatus } from '@/components/ui/LiveStatus';
import { syncDisplayState } from './syncStatus';

interface SyncErrorNoteProps {
  status: SyncStatus;
  online: boolean;
}

export function SyncErrorNote({ status, online }: SyncErrorNoteProps) {
  const { t } = useTranslation();
  const failed = syncDisplayState(status, online) === 'error';
  return (
    <>
      <LiveStatus>{failed && t('sync.errorNote')}</LiveStatus>
      {failed && (
        <p data-status-item className="px-3 py-1.5 text-[0.6875rem] text-danger uppercase">
          {t('sync.errorNote')}
        </p>
      )}
    </>
  );
}
