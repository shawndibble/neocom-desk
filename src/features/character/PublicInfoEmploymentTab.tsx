/**
 * Employment tab body for `PublicInfoModal`: the corporation history of the
 * Character the modal was opened on (not the active one). Lazy-loaded and
 * fetches on mount, so nothing is requested until the tab is first opened.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { loadPublicEmploymentHistory, type PublicEmploymentHistory } from './publicInfoData';

type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: PublicEmploymentHistory };

export default function PublicInfoEmploymentTab({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void loadPublicEmploymentHistory(characterId).then((data) => {
      if (!cancelled) setState(data ? { status: 'ready', data } : { status: 'error' });
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (state.status === 'loading') {
    return (
      <div className="flex justify-center py-8">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <EmptyState
        title={t('common.loadFailedTitle')}
        hint={t('common.loadFailedHint')}
        className="py-8"
      />
    );
  }
  const { rows, names } = state.data;
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
    <ul className="divide-y divide-line text-xs">
      {rows.map((row) => (
        <li key={row.recordId} className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="min-w-0 truncate">
            {names.get(row.corporationId) ?? `#${row.corporationId}`}
            {row.ongoing && (
              <span className="ml-2 text-accent uppercase">{t('employmentHistory.current')}</span>
            )}
          </span>
          <span className="shrink-0 text-text-dim">
            {new Date(row.startDate).toLocaleDateString()} · {formatDuration(row.tenureSeconds)}
          </span>
        </li>
      ))}
    </ul>
  );
}
