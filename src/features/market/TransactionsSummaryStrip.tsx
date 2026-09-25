import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatDateOnly } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { iskToneClass } from '@/features/character/format';
import type { WalletTransaction } from '@/esi/endpoints';
import { signedIsk } from './signedIsk';
import { summarizeTransactions } from './transactionDays';

interface TransactionsSummaryStripProps {
  transactions: readonly WalletTransaction[];
  className?: string;
}

/** The Sold / Bought / Net strip over the fills shown — phone day list and desktop table alike. */
export function TransactionsSummaryStrip({
  transactions,
  className,
}: TransactionsSummaryStripProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const summary = useMemo(() => summarizeTransactions(transactions), [transactions]);
  return (
    <section
      aria-label={t('wallet.transactionsSummaryLabel')}
      className={cx(
        'mx-3 mt-3 flex flex-col gap-2 rounded-xs border border-line bg-panel p-3',
        className
      )}
    >
      {summary.oldest && summary.newest && (
        <p className="text-xs text-text-dim">
          {t('wallet.transactionsRange', {
            from: formatDateOnly(new Date(summary.oldest), timeZone),
            to: formatDateOnly(new Date(summary.newest), timeZone),
          })}
        </p>
      )}
      <dl className="grid grid-cols-3 gap-3 tabular-nums">
        <SummaryFigure
          label={t('wallet.sold')}
          value={signedIsk(summary.sold, 0)}
          className={summary.sold > 0 ? 'text-isk-pos' : 'text-text'}
        />
        <SummaryFigure
          label={t('wallet.bought')}
          value={signedIsk(-summary.bought, 0)}
          className={summary.bought > 0 ? 'text-isk-neg' : 'text-text'}
        />
        <SummaryFigure
          label={t('wallet.net')}
          value={signedIsk(summary.net, 0)}
          className={cx('items-end', iskToneClass(summary.net))}
        />
      </dl>
    </section>
  );
}

function SummaryFigure({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className={cx('flex flex-col gap-0.5', className)}>
      <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}
