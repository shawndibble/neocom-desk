/**
 * One way to fix a budget, as Make it fit's Implants and Swap sections draw it:
 * what goes in (an icon and name per item), what it does to the budget the pilot
 * clicked ("Frees 41 tf" and a bar to where it lands, under the limit), what it
 * costs, and the trade-offs as chips. The whole card is the apply target.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, ProgressBar, TypeIcon } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import type { Resource } from '@/engine/fittings/makeItFit';
import { usedOf } from '@/engine/fittings/makeItFit';
import { fitsResourceBudget } from '@/engine/fittings/skillGaps';
import { STAT_DETAIL } from './statKit';
import type { FittingStats } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import { roundedAmount, totalOf, unitOf } from './makeItFitFreed';

export interface FixCardItem {
  key: string;
  typeId: number;
  name: string;
  /** Dim second line ("replaces X · Mid slot 2"). */
  detail?: string;
}

interface Props {
  /** Left edge colour: what kind of fix this is. */
  tone: 'accent' | 'warning';
  /** "Cheapest", "Recommended": the one this list leads with. */
  tag?: string;
  items: FixCardItem[];
  /** "Frees 41 tf"; null when nothing is freed on the clicked budget. */
  freed: string | null;
  /** The budget the pilot clicked, with the stats before and after, for the landing bar. */
  budget: { resource: Resource; before: FittingStats; after: FittingStats } | null;
  /** ISK to buy it; negative saves; null when a price is unknown. */
  cost: number | null;
  /** Trade-off chips, then the "All changes" disclosure, under the card. */
  chips?: ReactNode;
  footer?: ReactNode;
  onApply: () => void;
}

export function MakeItFitFixCard({
  tone,
  tag,
  items,
  freed,
  budget,
  cost,
  chips,
  footer,
  onApply,
}: Props) {
  const { t } = useTranslation();
  // The engine offers only fixes that clear every budget, so this holds for all three; checked, not assumed.
  const fits = budget !== null && fitsResourceBudget(budget.after);
  return (
    <li
      className={cx(
        'bg-panel relative rounded-xs border border-l-2',
        tone === 'accent' ? 'border-l-accent' : 'border-l-warning',
        tag ? 'border-success mt-2' : 'border-line'
      )}
    >
      {tag && (
        <Pill tone="success" className="absolute -top-2 left-2">
          {tag}
        </Pill>
      )}
      <button
        type="button"
        className={cx(
          'w-full rounded-xs p-2.5 text-left text-sm',
          tag && 'pt-4',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
        onClick={onApply}
      >
        <span className="block space-y-2">
          {items.map((item) => (
            <span key={item.key} className="flex items-center gap-2.5">
              <TypeIcon typeId={item.typeId} size={32} width={32} height={32} />
              <span className="min-w-0">
                <span className="block font-medium">{item.name}</span>
                {item.detail && <span className="text-text-dim block text-xs">{item.detail}</span>}
              </span>
            </span>
          ))}
        </span>
        <span className="border-line mt-2.5 block border-t pt-2">
          <span className="flex items-baseline justify-between gap-3">
            {freed && (
              <span className="text-success text-base font-semibold tabular-nums">{freed}</span>
            )}
            {cost !== null && (
              <span className={cx('ml-auto text-sm font-semibold', cost < 0 && 'text-success')}>
                <span className={cx(STAT_DETAIL, 'mr-1.5 tracking-widest uppercase')}>
                  {t(cost < 0 ? 'fittings.makeItFit.saves' : 'fittings.makeItFit.costs')}
                </span>
                <IskAmount value={Math.abs(cost)} />
              </span>
            )}
          </span>
          {budget && (
            <ProgressBar
              label={t('fittings.makeItFit.landsAt')}
              value={usedOf(budget.after, budget.resource)}
              max={Math.max(
                usedOf(budget.before, budget.resource),
                usedOf(budget.after, budget.resource)
              )}
              tone={fits ? 'success' : 'danger'}
              size="xs"
              className="mt-1.5"
            />
          )}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {budget && (
              <span className="text-text-dim tabular-nums">
                {t('fittings.makeItFit.after', {
                  used: roundedAmount(usedOf(budget.after, budget.resource)),
                  total: roundedAmount(totalOf(budget.after, budget.resource)),
                  unit: unitOf(budget.resource, t),
                })}
                {fits && (
                  <span className="text-success">
                    {' '}
                    <span aria-hidden="true">✓</span>
                    <span className="sr-only">{t('fittings.makeItFit.landsFits')}</span>
                  </span>
                )}
              </span>
            )}
            {chips}
          </span>
        </span>
      </button>
      {footer}
    </li>
  );
}
