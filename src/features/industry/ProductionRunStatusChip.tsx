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

/** "N lost" beside the status chip when a run carries Run Loss records (issue #2851). */
export function ProductionRunLostBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return <Pill tone="danger">{t('industry.lostBadge', { count })}</Pill>;
}

/**
 * A Production Run's sale status (issue #525): "New" (nothing sold yet),
 * "Open" (partially sold), "Closed" (fully sold). Shared between
 * `ProductionRunsPanel` (one Build Plan's own runs) and `ProductionLogPanel`
 * (the cross-plan aggregate) so both use the identical badge.
 */
export function ProductionRunStatusChip({ status }: { status: ProductionRunStatus }) {
  const { t } = useTranslation();
  return <Pill tone={TONE[status]}>{t(LABEL_KEY[status])}</Pill>;
}
