import { Fragment, useMemo, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { clampIskZero, formatIsk } from '@/lib/isk';
import { formatDateOnly } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { useScrollToRowKey } from '@/lib/useScrollToRowKey';
import { iskToneClass } from '@/features/character/format';
import { transactionTotal } from '@/features/character/walletTransactionsCsv';
import type { WalletTransaction } from '@/esi/endpoints';
import { MarketItemLink } from './MarketItemLink';
import { groupTransactionsByDay, summarizeTransactions } from './transactionDays';

interface TransactionsDayListProps {
  /** Newest first — the caller's order is the reading order. */
  transactions: readonly WalletTransaction[];
  nameFor: (typeId: number) => string;
  /** Accessible name for the list. */
  label: string;
  /** The fill a notification pointed at: scrolled to and pulsed. */
  highlightId: number | null;
  /** Wraps a row, e.g. the item context menu. Same contract as `DataTable`'s. */
  rowContextMenu?: (txn: WalletTransaction, row: ReactElement) => ReactElement;
}

/**
 * A signed ISK figure. `formatIsk` prints the minus but not the plus, and
 * colour alone must not carry the sign (DESIGN.md §1, ISK deltas).
 */
function signedIsk(value: number, decimals: number): string {
  const text = formatIsk(value, decimals);
  return clampIskZero(value, decimals) > 0 ? `+${text}` : text;
}

/**
 * Transactions below `sm`: a Sold / Bought / Net strip over the fills shown,
 * then the fills grouped by day with each day's net in its header.
 *
 * Its own list rather than `DataTable`'s stacked cards, which spend six
 * labelled lines on each fill. Days are read in the viewer's Time format zone.
 */
export function TransactionsDayList({
  transactions,
  nameFor,
  label,
  highlightId,
  rowContextMenu,
}: TransactionsDayListProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const listRef = useRef<HTMLDivElement>(null);
  useScrollToRowKey(listRef, highlightId, transactions);

  const days = useMemo(
    () => groupTransactionsByDay(transactions, timeZone),
    [transactions, timeZone]
  );
  const summary = useMemo(() => summarizeTransactions(transactions), [transactions]);

  const dayLabel = (date: string) =>
    new Date(date).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone,
    });
  const timeLabel = (date: string) =>
    new Date(date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone });

  return (
    <div ref={listRef}>
      <section
        aria-label={t('wallet.transactionsSummaryLabel')}
        className="mx-3 mt-3 flex flex-col gap-2 rounded-xs border border-line bg-panel p-3"
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
      <section aria-label={label} className="mt-2">
        {days.map((day, dayIndex) => (
          <Fragment key={`${day.dayKey}-${dayIndex}`}>
            <h3 className="flex items-baseline justify-between border-b border-line px-3 pt-4 pb-1.5">
              <span className="text-xs font-semibold tracking-widest text-text-dim uppercase">
                {dayLabel(day.rows[0].date)}
              </span>
              <span className={cx('text-xs font-semibold tabular-nums', iskToneClass(day.net))}>
                {signedIsk(day.net, 2)}
              </span>
            </h3>
            <ul className="divide-y divide-line border-b border-line">
              {day.rows.map((txn) => {
                const total = transactionTotal(txn);
                const row = (
                  <li
                    data-row-key={txn.transaction_id}
                    className={cx(
                      'grid min-h-13 grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 hover:bg-panel-2',
                      txn.transaction_id === highlightId && 'row-pulse'
                    )}
                  >
                    <span className="text-xs text-text-dim tabular-nums">
                      {timeLabel(txn.date)}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm text-text">
                        <MarketItemLink typeId={txn.type_id}>{nameFor(txn.type_id)}</MarketItemLink>
                      </span>
                      <span className="truncate text-xs text-text-dim tabular-nums">
                        {txn.is_buy ? t('wallet.buy') : t('wallet.sell')} ·{' '}
                        {txn.quantity.toLocaleString()} × {formatIsk(txn.unit_price, 2)}
                      </span>
                    </span>
                    <span
                      className={cx(
                        'text-right text-sm font-semibold tabular-nums',
                        iskToneClass(total)
                      )}
                    >
                      {signedIsk(total, 2)}
                    </span>
                  </li>
                );
                return (
                  <Fragment key={txn.transaction_id}>
                    {rowContextMenu ? rowContextMenu(txn, row) : row}
                  </Fragment>
                );
              })}
            </ul>
          </Fragment>
        ))}
      </section>
    </div>
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
