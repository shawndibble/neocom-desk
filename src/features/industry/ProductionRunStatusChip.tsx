import { useTranslation } from 'react-i18next';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { ProductionRunStatus } from './productionRunSummary';

const TONE: Record<ProductionRunStatus, PillTone> = {
  new: 'neutral',
  open: 'warning',
  closed: 'success',
};

const LABEL_KEY: Record<ProductionRunStatus, string> = {
  new: 'industry.productionRunStatusNew',
  open: 'industry.productionRunStatusOpen',
  closed: 'industry.productionRunStatusClosed',
};

export function ProductionRunLostBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return <Pill tone="danger">{t('industry.lostBadge', { count })}</Pill>;
}

export function ProductionRunStatusChip({ status }: { status: ProductionRunStatus }) {
  const { t } = useTranslation();
  return <Pill tone={TONE[status]}>{t(LABEL_KEY[status])}</Pill>;
}
