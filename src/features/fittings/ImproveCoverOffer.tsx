/**
 * The ticked set overruns: the covers added so far, each with its own tick,
 * the swaps on offer that would cover it, and the implant alternative.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import type { ImproveOption, RejectedOption } from '@/engine/fittings/improve';
import { optionKey } from '@/engine/fittings/improveKeys';
import { cx } from '@/lib/cx';
import { iskLine } from './improveChangeLines';
import type { ImproveLabels } from './useImproveLabels';

interface Props {
  overruns: boolean;
  /** Ticked rows that no list shows: covers added from here. */
  tickedCovers: ImproveOption[];
  /** The covers found and within budget; null while they are searched. */
  offered: ImproveOption[] | null;
  /** Whether covers were found at all, even ones over budget. */
  foundAny: boolean;
  setAsFix: RejectedOption | null;
  renderFlyableImplants?: (fix: RejectedOption, label: string) => ReactNode;
  labels: ImproveLabels;
  onToggle: (option: ImproveOption) => void;
}

export function ImproveCoverOffer({
  overruns,
  tickedCovers,
  offered,
  foundAny,
  setAsFix,
  renderFlyableImplants,
  labels,
  onToggle,
}: Props) {
  const { t } = useTranslation();
  const named = (option: ImproveOption) =>
    [labels.moveLabel(option.candidate), ...labels.flyableSwaps(option.candidate)].join('; ');
  return (
    <div className="space-y-1 text-sm" data-testid="improve-cover">
      {tickedCovers.map((pick) => (
        <label
          key={optionKey(pick)}
          className={cx('flex items-start gap-2 text-xs', tappableRowClassName)}
        >
          <Checkbox checked onChange={() => onToggle(pick)} />
          <span>{t('fittings.improve.cover.added', { swaps: named(pick) })}</span>
        </label>
      ))}
      {!overruns ? null : offered === null ? (
        <p className="text-text-dim text-xs" role="status">
          {t('fittings.improve.cover.searching')}
        </p>
      ) : (
        <>
          <p className="text-xs font-medium">
            {offered.length > 0
              ? t('fittings.improve.cover.title')
              : foundAny
                ? t('fittings.improve.cover.overBudget')
                : t('fittings.improve.cover.none')}
          </p>
          {offered.map((option) => (
            <button
              key={optionKey(option)}
              type="button"
              className={cx(
                'border-line w-full rounded-xs border p-2 text-left text-xs',
                rowInteractiveClassName,
                focusRingInsetClassName
              )}
              onClick={() => onToggle(option)}
            >
              <span className="block font-medium">{named(option)}</span>
              <span className="block">{iskLine(t, option)}</span>
            </button>
          ))}
        </>
      )}
      {overruns &&
        setAsFix &&
        renderFlyableImplants?.(setAsFix, t('fittings.improve.cover.thisSet'))}
    </div>
  );
}
