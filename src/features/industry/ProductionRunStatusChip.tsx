import { useTranslation } from 'react-i18next';
import type { ProductionRunStatus } from './productionRunSummary';

/** Same inline-badge shape as `ActiveJobsPanel`'s "Completing soon" tag — border/bg/text at one tone. */
const TONE_CLASS: Record<ProductionRunStatus, string> = {
  new: 'border-accent/50 bg-accent/15 text-accent',
  open: 'border-warning/50 bg-warning/15 text-warning',
  closed: 'border-success/50 bg-success/15 text-success',
};

const LABEL_KEY: Record<ProductionRunStatus, string> = {
  new: 'industry.productionRunStatusNew',
  open: 'industry.productionRunStatusOpen',
  closed: 'industry.productionRunStatusClosed',
};

/**
 * A Production Run's sale status (issue #525): "New" (nothing sold yet),
 * "Open" (partially sold), "Closed" (fully sold). Shared between
 * `ProductionRunsPanel` (one Build Plan's own runs) and `ProductionLogPanel`
 * (the cross-plan aggregate) so both use the identical badge.
 */
export function ProductionRunStatusChip({ status }: { status: ProductionRunStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest uppercase ${TONE_CLASS[status]}`}
    >
      {t(LABEL_KEY[status])}
    </span>
  );
}
