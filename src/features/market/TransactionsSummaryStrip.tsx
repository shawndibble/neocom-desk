import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { cx } from '@/lib/cx';
import { formatDateOnly } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { iskToneClass } from '@/features/character/format';
import type { WalletTransaction } from '@/esi/endpoints';
import { signedIsk } from '@/lib/signedIsk';
import { summarizeTransactions } from './transactionDays';
import type { TradingSummary } from './tradingSummary';

interface TransactionsSummaryStripProps {
  transactions: readonly WalletTransaction[];
  /** Margin, matched count and broker fees over the same fills; omitted while they can't be worked out. */
  trading?: TradingSummary;
  className?: string;
}

/** The Sold / Bought / Net card over the fills shown, above Market History's table. */
export function TransactionsSummaryStrip({
  transactions,
  trading,
  className,
}: TransactionsSummaryStripProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const summary = useMemo(() => summarizeTransactions(transactions), [transactions]);
  return (
    <section
      aria-label={t('wallet.transactionsSummaryLabel')}
      className={cx(
        'flex flex-col gap-2 rounded-xs border border-line bg-panel/85 p-3 backdrop-blur-sm',
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
      <dl className="grid grid-cols-2 items-start gap-x-4 gap-y-3 tabular-nums min-[26rem]:grid-cols-3 lg:grid-cols-5">
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
          className={iskToneClass(summary.net)}
        />
        {trading && trading.matched > 0 && (
          <SummaryFigure
            label={t('wallet.tradingMargin')}
            value={signedIsk(trading.margin, 0)}
            note={t('wallet.tradingMatched', { matched: trading.matched, count: trading.sales })}
            className={iskToneClass(trading.margin)}
          />
        )}
        {trading && (
          <SummaryFigure
            label={t('wallet.brokerFees')}
            tooltip={t('wallet.brokerFeesTooltip')}
            value={signedIsk(-trading.brokerFees, 0)}
            className={trading.brokerFees > 0 ? 'text-isk-neg' : 'text-text'}
          />
        )}
      </dl>
      {trading?.archiveSince != null && (
        <p className="text-xs text-text-dim">
          {t('wallet.archiveSince', {
            date: formatDateOnly(new Date(trading.archiveSince), timeZone),
          })}
        </p>
      )}
    </section>
  );
}

function SummaryFigure({
  label,
  value,
  note,
  tooltip,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  tooltip?: string;
  className: string;
}) {
  return (
    <div className={cx('flex flex-col gap-0.5 whitespace-nowrap', className)}>
      <dt className={eyebrowClassName}>
        {tooltip ? <HintText content={tooltip}>{label}</HintText> : label}
      </dt>
      <dd className="text-sm font-semibold">{value}</dd>
      {note && <dd className="text-[0.6875rem] font-normal text-text-dim">{note}</dd>}
    </div>
  );
}
