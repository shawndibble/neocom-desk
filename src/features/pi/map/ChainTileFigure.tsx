import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';

export function ChainEstimateMark({ tight = false }: { tight?: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cx(
        'rounded-xs border border-warning/60 px-1 text-[0.6875rem] font-semibold text-warning',
        tight ? 'leading-[0.6875rem]' : 'leading-[0.875rem]'
      )}
    >
      {t('piShared.estimateBadge')}
    </span>
  );
}

export function ChainTileFigure({
  iskPerDay,
  stacked = false,
  className,
}: {
  iskPerDay: number;
  stacked?: boolean;
  className?: string;
}) {
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
      <ChainEstimateMark tight={stacked} />
    </span>
  );
}
