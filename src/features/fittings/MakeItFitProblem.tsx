/**
 * The top of Make it fit: how far over each budget the Fitting is, as a bar
 * full to what it needs with a line where the hull's limit falls, so the
 * pilot sees the size of the problem before the fixes that close it.
 */
import { useTranslation } from 'react-i18next';
import { ProgressBar } from '@/components/ui';
import type { FittingStats } from '@/engine/fittings/types';
import { overBudgets, roundedAmount, unitOf } from './makeItFitFreed';

export function MakeItFitProblem({ before }: { before: FittingStats }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {overBudgets(before).map(({ resource, used, total, over }) => {
        const unit = unitOf(resource, t);
        return (
          <div key={resource} className="border-danger/40 bg-danger/10 rounded-xs border p-3">
            <p className="text-danger text-lg font-semibold tabular-nums">
              {t('fittings.makeItFit.problem', {
                resource: t(`fittings.makeItFit.resourceName.${resource}`),
                over: roundedAmount(Math.ceil(over)),
                unit,
              })}
            </p>
            <div className="relative my-2">
              <ProgressBar
                label={t(`fittings.makeItFit.resourceName.${resource}`)}
                value={used}
                max={used}
                tone="danger"
                size="md"
              />
              <span
                aria-hidden="true"
                className="bg-text absolute -top-1 -bottom-1 w-0.5"
                style={{ left: `${(total / used) * 100}%` }}
              />
            </div>
            <p className="text-text-dim flex justify-between text-xs tabular-nums">
              <span>{t('fittings.makeItFit.using', { used: roundedAmount(used), unit })}</span>
              <span>{t('fittings.makeItFit.hullHas', { total: roundedAmount(total), unit })}</span>
            </p>
          </div>
        );
      })}
      <p className="text-text-dim text-xs">{t('fittings.makeItFit.intro')}</p>
    </div>
  );
}
