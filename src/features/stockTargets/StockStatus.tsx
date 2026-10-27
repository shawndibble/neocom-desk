/**
 * A Stock Target's status as a tinted word (§6c: a computed verdict, never
 * clickable, the word always shown) and its fill as a thin bar beside the
 * numbers that already say it — so the bar is decoration, hidden from
 * assistive tech, and colour is never the only signal.
 */
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

/** A market's worst need ("2 out", "3 low", "Stocked"), tinted like the item status it sums. */
export function StockNeedPill({ need, children }: { need: MarketNeed; children: ReactNode }) {
  return <span className={cx(pillClassName, NEED_CLASS[need])}>{children}</span>;
}

/**
 * Solid for what is listed, hatched after it for the hangar stock at the
 * market that would cover the rest of the Stock Target.
 */
export function StockFillBar({
  status,
  fill,
  hangarFill = 0,
  className,
}: {
  status: StockStatus;
  /** Listed over Stock Target. */
  fill: number;
  /** The hangar's share of the Stock Target that listing would cover. */
  hangarFill?: number;
  className?: string;
}) {
  const listed = Math.min(100, Math.round(fill * 100));
  const hangar = Math.max(0, Math.min(100 - listed, Math.round(hangarFill * 100)));
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
    </span>
  );
}
