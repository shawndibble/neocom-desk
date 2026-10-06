/**
 * A P3/P4 tile's multi-planet chain estimate: the shorthand figure, dimmed
 * and marked "Est." so it never reads as a one-planet figure. No ▲ ≈ ▼: those
 * compare a one-planet figure with its planet's simplest product. Decorative: the
 * tile's accessible name and tooltip carry the exact figure and its wording.
 */
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';

export function ChainTileFigure({
  iskPerDay,
  stacked = false,
  className,
}: {
  iskPerDay: number;
  /** The mark under the figure: a desk tile is narrow, and two short lines fit its height. */
  stacked?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex text-[0.6875rem] text-text-dim tabular-nums',
        stacked ? 'flex-col items-end gap-px leading-[0.6875rem]' : 'items-center gap-1',
        className
      )}
    >
      <span className="font-semibold">{formatIskCompact(iskPerDay)}</span>
      <span
        className={cx(
          'rounded-xs border border-warning/60 px-1 font-semibold text-warning',
          stacked ? 'text-[0.625rem] leading-[0.6875rem]' : 'text-[0.625rem] leading-[0.875rem]'
        )}
      >
        {t('piShared.estimateBadge')}
      </span>
    </span>
  );
}
