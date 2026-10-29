/**
 * Where an Improve search stands when it has nothing to list: progress with
 * Cancel and "Show best so far", or why there is nothing to show.
 */
import { useTranslation } from 'react-i18next';
import { Button, ProgressBar, Spinner } from '@/components/ui';
import { formatIskCompact } from '@/lib/isk';
import type { ImproveSearch } from './useImprove';

/** The search's own state: progress, cancelled, below the budget's price, or failed. Nothing once done. */
export function ImproveSearchStatus({
  search,
  round,
}: {
  search: ImproveSearch;
  /** A multi-round search (Makeover): the round it is in and the most it will run. */
  round?: { current: number; max: number };
}) {
  const { t } = useTranslation();
  const { state } = search;
  return (
    <>
      {state.status === 'searching' && (
        <div className="space-y-2">
          <p className="text-text-dim flex items-center gap-2 text-sm">
            <Spinner />
            {round
              ? t('fittings.improve.checkingRound', {
                  round: round.current,
                  max: round.max,
                  checked: state.checked,
                  total: state.total,
                })
              : t('fittings.improve.checking', { checked: state.checked, total: state.total })}
          </p>
          <ProgressBar
            label={t('fittings.improve.progressLabel')}
            value={state.total > 0 ? state.checked : null}
            max={Math.max(1, state.total)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={search.cancel}>
              {t('fittings.improve.cancel')}
            </Button>
            {state.slow && (
              <Button size="sm" onClick={search.showBestSoFar}>
                {t('fittings.improve.bestSoFar')}
              </Button>
            )}
          </div>
        </div>
      )}

      {state.status === 'cancelled' && (
        <div className="space-y-2">
          <p className="text-text-dim text-sm">{t('fittings.improve.cancelled')}</p>
          <Button size="sm" onClick={search.restart}>
            {t('fittings.improve.searchAgain')}
          </Button>
        </div>
      )}

      {state.status === 'belowPrice' && (
        <p className="text-warning text-sm" data-testid="improve-below-price">
          {t('fittings.improve.belowPrice', {
            budget: formatIskCompact(state.budget),
            price: formatIskCompact(state.fitTotal),
          })}
        </p>
      )}

      {state.status === 'failed' && (
        <p className="text-danger text-sm">{t('fittings.improve.failed')}</p>
      )}
    </>
  );
}
