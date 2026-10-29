/**
 * Employment tab body for `PublicInfoModal`: the corporation history of the
 * Character the modal was opened on (not the active one). Lazy-loaded and
 * fetches on mount, so nothing is requested until the tab is first opened.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { EmploymentSummaryChips, EmploymentTimeline } from './EmploymentTimeline';
import { loadPublicEmploymentHistory } from './publicInfoData';

export default function PublicInfoEmploymentTab({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const loader = useCallback(() => loadPublicEmploymentHistory(characterId), [characterId]);
  const { status, data } = useAsyncLoad(loader);

  if (status === 'loading' || status === 'idle') {
    return <Spinner block="panel" label={t('common.loading')} />;
  }
  if (status === 'failed' || !data) {
    return (
      <EmptyState
        title={t('common.loadFailedTitle')}
        hint={t('common.loadFailedHint')}
        className="py-8"
      />
    );
  }
  const { rows, summary, names } = data;
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('publicInfo.employmentEmptyTitle')}
        hint={t('publicInfo.employmentEmptyHint')}
        className="py-8"
      />
    );
  }
  return (
    <div className="space-y-3">
      <EmploymentSummaryChips summary={summary} names={names} />
      <EmploymentTimeline
        variant="modal"
        rows={rows}
        names={names}
        label={t('publicInfo.employmentTab')}
      />
    </div>
  );
}
