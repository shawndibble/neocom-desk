import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MarketNeed } from '@/engine/stockTargets/markets';
import type { StockStatus } from '@/engine/stockTargets/stockRows';
import { cx } from '@/lib/cx';

const PILL_CLASS: Record<StockStatus, string> = {
  out: 'text-danger bg-danger/10',
  low: 'text-warning bg-warning/10',
  ok: 'text-success bg-success/10',
  over: 'text-accent bg-accent/10',
};

const NEED_CLASS: Record<MarketNeed, string> = {
  out: PILL_CLASS.out,
  low: PILL_CLASS.low,
  stocked: PILL_CLASS.ok,
};

const BAR_CLASS: Record<StockStatus, string> = {
  out: 'bg-danger',
  low: 'bg-warning',
  ok: 'bg-success',
  over: 'bg-accent',
};

const pillClassName =
  'inline-flex rounded-xs px-1.5 text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase';

export function StockStatusPill({ status }: { status: StockStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cx(pillClassName, PILL_CLASS[status])}>
      {t(`stockTargets.status.${status}`)}
    </span>
  );
}

export function StockNeedPill({ need, children }: { need: MarketNeed; children: ReactNode }) {
  return <span className={cx(pillClassName, NEED_CLASS[need])}>{children}</span>;
}

export function StockFillBar({
  status,
  fill,
  hangarFill = 0,
  jobsFill = 0,
  className,
}: {
  status: StockStatus;
  fill: number;
  hangarFill?: number;
  jobsFill?: number;
  className?: string;
}) {
  const listed = Math.min(100, Math.round(fill * 100));
  const hangar = Math.max(0, Math.min(100 - listed, Math.round(hangarFill * 100)));
  const jobs = Math.max(0, Math.min(100 - listed - hangar, Math.round(jobsFill * 100)));
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
        style={{ width: `${listed}%` }}
      />
      {hangar > 0 && (
        <span
          className="stock-bar-hangar absolute inset-y-0"
          style={{ left: `${listed}%`, width: `${hangar}%` }}
        />
      )}
      {jobs > 0 && (
        <span
          className="stock-bar-jobs absolute inset-y-0"
          style={{ left: `${listed + hangar}%`, width: `${jobs}%` }}
        />
      )}
    </span>
  );
}
