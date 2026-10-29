/**
 * Where an Improve search stands when it has nothing to list: the warnings
 * about weapons and miners that hold nothing, then progress with Cancel and
 * "Show best so far", or why there is nothing to show.
 */
import { useTranslation } from 'react-i18next';
import { Button, ProgressBar, Spinner } from '@/components/ui';
import type { UnloadedWeapons } from '@/engine/fittings/improveCharges';
import { crystalParts } from '@/engine/fittings/improveMining';
import { formatIskCompact } from '@/lib/isk';
import { crystalBasisOf } from './improveCrystalBasis';
import { m3sFormat } from './improveLineText';
import type { ImproveSearch } from './useImprove';

interface UnloadedProps {
  unloaded?: UnloadedWeapons | null;
  onLoadBestCharge?: () => void;
  state: ImproveSearch['state'];
  oreFamily: string;
  onLoadBestCrystal?: () => void;
}

/** Weapons holding no charge, which damage goals can't score, and Mine more's miners without the best crystals. */
export function ImproveUnloadedNotices({
  unloaded,
  onLoadBestCharge,
  state,
  oreFamily,
  onLoadBestCrystal,
}: UnloadedProps) {
  const { t } = useTranslation();
  const { basis, unloaded: unloadedCrystals, now, best } = crystalBasisOf(state);
  return (
    <>
      {unloaded && (
        <div className="space-y-2">
          <p role="status" className="text-warning text-sm">
            {t(`fittings.improve.unloaded.${unloaded.kind}`, { count: unloaded.count })}
          </p>
          {onLoadBestCharge && (
            <Button size="sm" onClick={onLoadBestCharge}>
              {t('fittings.improve.loadBestCharge')}
            </Button>
          )}
        </div>
      )}

      {unloadedCrystals && (
        <div className="space-y-2">
          <p role="status" className="text-warning text-sm">
            {t('fittings.improve.unloadedCrystals', {
              count: unloadedCrystals.count,
              family: oreFamily,
              now: m3sFormat(now),
              crystal: t('fittings.improve.crystalType', crystalParts(basis?.bestKey ?? '')),
              best: m3sFormat(best),
            })}
          </p>
          {onLoadBestCrystal && (
            <Button size="sm" onClick={onLoadBestCrystal}>
              {t('fittings.improve.loadBestCrystal')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** The search's own state: progress, cancelled, below the budget's price, or failed. Nothing once done. */
export function ImproveSearchStatus({ search }: { search: ImproveSearch }) {
  const { t } = useTranslation();
  const { state } = search;
  return (
    <>
      {state.status === 'searching' && (
        <div className="space-y-2">
          <p className="text-text-dim flex items-center gap-2 text-sm">
            <Spinner />
            {t('fittings.improve.checking', { checked: state.checked, total: state.total })}
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
