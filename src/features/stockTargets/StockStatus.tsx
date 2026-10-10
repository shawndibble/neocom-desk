/**
 * A Stock Target's status as a tinted word (§6c: a computed verdict, never
 * clickable, the word always shown) and its fill as a thin bar beside the
 * numbers that already say it — so the bar is decoration, hidden from
 * assistive tech, and colour is never the only signal.
 */
import { useTranslation } from 'react-i18next';
import type { StockStatus } from '@/engine/stockTargets/stockRows';
import { cx } from '@/lib/cx';

const PILL_CLASS: Record<StockStatus, string> = {
  out: 'text-danger bg-danger/10',
  low: 'text-warning bg-warning/10',
  ok: 'text-success bg-success/10',
  over: 'text-accent bg-accent/10',
};

const BAR_CLASS: Record<StockStatus, string> = {
  out: 'bg-danger',
  low: 'bg-warning',
  ok: 'bg-success',
  over: 'bg-accent',
};

function useStockStatusLabel(): (status: StockStatus) => string {
  const { t } = useTranslation();
  return (status) => t(`stockTargets.status.${status}`);
}

export function StockStatusPill({ status }: { status: StockStatus }) {
  const label = useStockStatusLabel();
  return (
    <span
      className={cx(
        'inline-flex rounded-xs px-1.5 text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase',
        PILL_CLASS[status]
      )}
    >
      {label(status)}
    </span>
  );
}

export function StockFillBar({
  status,
  fill,
  className,
}: {
  status: StockStatus;
  fill: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative block h-1.5 min-w-16 overflow-hidden rounded-xs border border-line bg-panel-2',
        className
      )}
    >
      <span
        className={cx('absolute inset-y-0 left-0', BAR_CLASS[status])}
        style={{ width: `${Math.min(100, Math.round(fill * 100))}%` }}
      />
    </span>
  );
}
