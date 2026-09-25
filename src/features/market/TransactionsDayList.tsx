import { Fragment, useMemo, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { RowMoreActions } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { useTimeZone } from '@/lib/timeFormat';
import { useScrollToRowKey } from '@/lib/useScrollToRowKey';
import { iskToneClass } from '@/features/character/format';
import { transactionTotal } from '@/features/character/walletTransactionsCsv';
import type { WalletTransaction } from '@/esi/endpoints';
import { MarketItemLink } from './MarketItemLink';
import { groupTransactionsByDay } from './transactionDays';
import { signedIsk } from './signedIsk';
import { TransactionsSummaryStrip } from './TransactionsSummaryStrip';

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
      <TransactionsSummaryStrip transactions={transactions} />
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
                      'grid min-h-13 grid-cols-[4rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 py-2 pr-1 pl-3 hover:bg-panel-2',
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
                    <RowMoreActions />
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
