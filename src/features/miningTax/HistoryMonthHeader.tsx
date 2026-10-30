import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';

/** A History month's fold row: which month, how many entries, what was paid in it. */
export function HistoryMonthHeader({
  month,
  count,
  taxTotal,
}: {
  month: string;
  count: number;
  taxTotal: number;
}) {
  const { t, i18n } = useTranslation();
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-semibold">{label}</span>
      <span className="text-[0.6875rem] text-text-dim tabular-nums">
        {t('miningTax.sections.monthSummary', { count, amount: formatIsk(taxTotal, 0) })}
      </span>
    </span>
  );
}
