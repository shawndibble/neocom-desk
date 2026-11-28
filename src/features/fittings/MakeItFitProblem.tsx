import { useTranslation } from 'react-i18next';
import { ProgressBar } from '@/components/ui';
import type { FittingStats } from '@/engine/fittings/types';
import { Well } from '@/components/ui/Well';
import { overBudgets, roundedAmount, unitOf } from './makeItFitFreed';

export function MakeItFitProblem({ before }: { before: FittingStats }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {overBudgets(before).map(({ resource, used, total, over }) => {
        const unit = unitOf(resource, t);
        return (
          <Well tone="danger" size="lg" key={resource}>
            <p className="text-danger text-base font-semibold tabular-nums">
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
          </Well>
        );
      })}
      <p className="text-text-dim text-xs">{t('fittings.makeItFit.intro')}</p>
    </div>
  );
}
