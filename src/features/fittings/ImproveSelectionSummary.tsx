/**
 * The ticked set checked together: how many changes, the DPS and EHP they
 * leave, what they cost, and any problem they cause. While the check runs, or
 * if it failed, a line says so.
 */
import { useTranslation } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import type { FittingStats } from '@/engine/fittings/types';
import type { SelectionSummary } from '@/engine/fittings/improveSelection';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { m3Format, m3sFormat } from './improveLineText';

interface Props {
  summary: SelectionSummary | null;
  /** The set's checked stats: null when the check failed, undefined while it runs. */
  checked: FittingStats | null | undefined;
  iskBudget: number | null;
}

export function ImproveSelectionSummary({ summary, checked, iskBudget }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-end justify-between gap-3 text-sm" data-testid="improve-selection">
      {summary ? (
        <>
          <div className="min-w-0 space-y-1">
            <p>{t('fittings.improve.selection.changes', { count: summary.count })}</p>
            <p>
              {t('fittings.improve.selection.dps', {
                before: m3sFormat(summary.dps.before),
                after: m3sFormat(summary.dps.after),
              })}
              {' · '}
              {t('fittings.improve.selection.ehp', {
                before: m3Format(summary.ehp.before),
                after: m3Format(summary.ehp.after),
              })}
            </p>
            {summary.problems.map((problem) => (
              <p
                key={problem.kind === 'over' ? problem.resource : problem.kind}
                role="alert"
                className="text-danger text-xs"
              >
                {t(`fittings.improve.selection.problem.${problem.kind}`, {
                  resource:
                    problem.kind === 'over'
                      ? t(`fittings.improve.selection.resource.${problem.resource}`)
                      : undefined,
                })}
              </p>
            ))}
          </div>
          <SelectionCost summary={summary} iskBudget={iskBudget} />
        </>
      ) : (
        <p className="text-text-dim text-xs" role="status">
          {checked === null
            ? t('fittings.improve.selection.failed')
            : t('fittings.improve.selection.checking')}
        </p>
      )}
    </div>
  );
}

/**
 * The ticked set's price: the fit's total cost after with what the
 * ticks add to it, or just that change when there is no total to compare.
 */
function SelectionCost({
  summary,
  iskBudget,
}: {
  summary: SelectionSummary;
  iskBudget: number | null;
}) {
  const { t } = useTranslation();
  const tone =
    summary.isk < 0 ? 'text-success' : summary.isk > 0 ? 'text-warning' : 'text-text-dim';
  const delta =
    summary.isk === 0 ? (
      t('fittings.improve.selection.noChange')
    ) : (
      <>
        {summary.isk < 0 ? '−' : '+'}
        <IskAmount value={Math.abs(summary.isk)} />
      </>
    );
  const total = summary.total;
  return (
    <div className="shrink-0 text-right" data-testid="improve-cost">
      <p className="text-text-dim text-xs">
        {t(
          total !== null
            ? 'fittings.improve.selection.totalCost'
            : 'fittings.improve.selection.costChange'
        )}
      </p>
      <p className="text-base font-semibold">
        {total !== null ? (
          <>
            <IskAmount value={total} />{' '}
            <span className={cx('text-sm font-normal', tone)}>({delta})</span>
          </>
        ) : (
          <span className={tone}>{delta}</span>
        )}
      </p>
      {(summary.unpriced > 0 || (total !== null && iskBudget !== null)) && (
        <p className="text-text-dim text-xs">
          {total !== null &&
            iskBudget !== null &&
            t('fittings.improve.selection.ofBudget', { cap: formatIskCompact(iskBudget) })}
          {total !== null && iskBudget !== null && summary.unpriced > 0 && ' · '}
          {summary.unpriced > 0 &&
            `+ ${t('fittings.improve.selection.unpriced', { count: summary.unpriced })}`}
        </p>
      )}
    </div>
  );
}
