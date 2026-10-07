/**
 * Packaged volume of the Appraisal against the Hauling Cargo Space. Rendered
 * only once a Cargo Space is set; a line with no known volume is said so, not
 * guessed.
 */
import { useTranslation } from 'react-i18next';
import type { AppraisalTotals } from '@/engine/market/appraisal';
import { formatCubicMetres } from '@/lib/volume';
import { totalCargoM3, type HaulingCargo } from './haulingCargo';

export function AppraisalHoldBar({
  totals,
  cargo,
}: {
  totals: Pick<AppraisalTotals, 'volume' | 'volumeUnknownRows'>;
  cargo: HaulingCargo;
}) {
  const { t } = useTranslation();
  const capacity = totalCargoM3(cargo);
  const fits = totals.volume <= capacity;
  const pct = capacity > 0 ? Math.min(100, (totals.volume / capacity) * 100) : 0;
  return (
    <div className="flex flex-col gap-1 border-b border-line px-3 py-2" data-testid="hold-bar">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.6875rem]">
        <span className="font-semibold tracking-widest text-text-dim uppercase">
          {t('market.appraisal.holdTitle', { ship: cargo.label })}
        </span>
        <span className={fits ? 'text-text' : 'text-warning'}>
          {t('market.appraisal.holdFill', {
            used: formatCubicMetres(totals.volume),
            capacity: formatCubicMetres(capacity),
          })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={t('market.appraisal.holdTitle', { ship: cargo.label })}
        className="h-1.5 overflow-hidden rounded-xs bg-panel-2"
      >
        <div
          className={fits ? 'h-full bg-accent' : 'h-full bg-warning'}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[0.6875rem] text-text-dim">
        {fits ? t('market.appraisal.holdFits') : t('market.appraisal.holdOver')}
        {totals.volumeUnknownRows > 0 &&
          ` ${t('market.appraisal.holdUnknown', { count: totals.volumeUnknownRows })}`}
      </p>
    </div>
  );
}
