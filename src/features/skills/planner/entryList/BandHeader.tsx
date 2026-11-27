import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTranslation } from 'react-i18next';
import type { PlanPriority } from '@/engine/types';
import type { AttributePair } from '../attributePairBands';
import { attributePairLabel, priorityLabelKey } from './rowChrome';

export type BandInfo =
  { kind: 'priority'; priority: PlanPriority } | ({ kind: 'attributePair' } & AttributePair);

interface BandHeaderProps {
  band: BandInfo;
}

export function BandHeader({ band }: BandHeaderProps) {
  const { t } = useTranslation();
  const text =
    band.kind === 'priority'
      ? t('plans.priorityBand', { label: t(priorityLabelKey(band.priority)) })
      : t('plans.attributePairBand', {
          pair: attributePairLabel(band.primary, band.secondary),
        });
  return (
    <li className={`${eyebrowClassName} border-b border-line bg-panel-2 px-2 py-1`}>{text}</li>
  );
}
