import { useTranslation } from 'react-i18next';
import { EmptyState, LoadFailedState, Spinner } from '@/components/ui';
import { OfficerQueue } from './OfficerQueue';
import { useSrpQueue } from './useSrpQueue';

export function SrpOfficerView() {
  const { t } = useTranslation();
  const data = useSrpQueue();
  const { state } = data;
  switch (state.status) {
    case 'loading':
      return <Spinner label={t('common.loading')} />;
    case 'denied':
      return <EmptyState title={t('srp.officer.deniedTitle')} hint={t('srp.officer.deniedHint')} />;
    case 'failed':
      return <LoadFailedState title={t('srp.officer.loadFailed')} onRetry={data.reload} />;
    case 'ready':
      return <OfficerQueue data={data} ready={state} />;
  }
}
