/**
 * A P3/P4 tile's multi-planet chain estimate: the shorthand figure, dimmed
 * and marked "Est." so it never reads as a one-planet figure. Decorative: the
 * tile's accessible name and tooltip carry the exact figure and its wording.
 */
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';

export function ChainTileFigure({
  iskPerDay,
  className,
}: {
  iskPerDay: number;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      aria-hidden="true"
      className={cx('flex items-center gap-1 text-[11px] text-text-dim tabular-nums', className)}
    >
      <span className="font-semibold">≈{formatIskCompact(iskPerDay)}</span>
      <span className="rounded-xs border border-warning/60 px-1 text-[10px] leading-[14px] font-semibold text-warning">
        {t('piShared.estimateBadge')}
      </span>
    </span>
  );
}
