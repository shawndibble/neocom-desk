import { useTranslation } from 'react-i18next';
import type { PlanPriority } from '@/engine/types';
import type { AttributePair } from '../attributePairBands';
import { attributePairLabel, priorityLabelKey } from './rowChrome';

/** A band header's grouping (#115): either mode carries enough to render its label. */
export type BandInfo =
  { kind: 'priority'; priority: PlanPriority } | ({ kind: 'attributePair' } & AttributePair);

interface BandHeaderProps {
  band: BandInfo;
}

/** Divider marking where a run of same-priority (#27) or same-attribute-pair (#115) entries begins. */
export function BandHeader({ band }: BandHeaderProps) {
  const { t } = useTranslation();
  const text =
    band.kind === 'priority'
      ? t('plans.priorityBand', { label: t(priorityLabelKey(band.priority)) })
      : t('plans.attributePairBand', {
          pair: attributePairLabel(band.primary, band.secondary),
        });
  return (
    <li className="border-b border-line bg-panel-2 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-widest text-text-dim">
      {text}
    </li>
  );
}
