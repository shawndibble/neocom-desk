import { Fragment, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buttonClassName,
  nextDataTableSort,
  RowMoreActions,
  sortRows,
  type DataTableSort,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { formatDateOnly } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import type { MarketOrderHistory } from '@/esi/endpoints';
import { MarketItemLink } from './MarketItemLink';

interface OrderHistoryListProps {
  orders: readonly MarketOrderHistory[];
  nameFor: (typeId: number) => string;
  /** Accessible name for the list. */
  label: string;
  /** Wraps a row, e.g. the item context menu. Same contract as `DataTable`'s. */
  rowContextMenu?: (order: MarketOrderHistory, row: ReactElement) => ReactElement;
}

type SortColumnId = 'item' | 'filled' | 'price';

/** Units that changed hands — ESI reports an order that filled completely as `expired` with nothing left. */
function filledOf(order: MarketOrderHistory): number {
  return order.volume_total - order.volume_remain;
}

/**
 * Order history below `sm`: three columns — item, filled, price — with side,
 * state and issue date folded under the name, and a tap to open the rest.
 * The price is shorthand in the row and exact once opened — the row's tap is
 * the toggle, so it can't also be `IskAmount`'s reveal (and a focusable span
 * inside a button would be nested interactive content).
 *
 * Its own list rather than `DataTable`'s stacked cards, which give each of six
 * fields its own labelled line and fit about four orders on a phone. Sorting
 * uses `DataTable`'s own rule (`sortRows`/`nextDataTableSort`); with no column
 * picked, rows keep the caller's order (newest issued first).
 */
export function OrderHistoryList({
  orders,
  nameFor,
  label,
  rowContextMenu,
}: OrderHistoryListProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const sortValues: Record<SortColumnId, (order: MarketOrderHistory) => string | number> = useMemo(
    () => ({
      item: (order) => nameFor(order.type_id),
      filled: filledOf,
      price: (order) => order.price,
    }),
    [nameFor]
  );

  const rows = useMemo(() => {
    if (!sort) return orders;
    return sortRows(
      orders,
      { sortValue: sortValues[sort.columnId as SortColumnId] },
      sort.direction
    );
  }, [orders, sort, sortValues]);

  const sideLabel = (order: MarketOrderHistory) =>
    order.is_buy_order ? t('orders.buy') : t('orders.sell');
  const stateLabel = (order: MarketOrderHistory) =>
    order.state === 'cancelled' ? t('orders.stateCancelled') : t('orders.stateExpired');

  function header(id: SortColumnId, text: string, align: 'left' | 'right') {
    const active = sort?.columnId === id;
    const Glyph = !active ? Icon.Sort : sort.direction === 'asc' ? Icon.Ascending : Icon.Descending;
    return (
      <button
        type="button"
        onClick={() => setSort((previous) => nextDataTableSort(previous, id))}
        aria-label={
          active
            ? t(sort.direction === 'asc' ? 'orders.sortedAsc' : 'orders.sortedDesc', {
                column: text,
              })
            : t('orders.sortBy', { column: text })
        }
        className={cx(
          'flex min-h-11 items-center gap-1 text-[0.6875rem] font-semibold tracking-widest uppercase focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
          align === 'right' && 'justify-end',
          active ? 'text-text' : 'text-text-dim'
        )}
      >
        {text}
        <Glyph
          aria-hidden="true"
          size={Icon.ICON_SIZE.sm}
          className={cx('shrink-0', active ? 'text-accent' : 'text-text-faint')}
        />
      </button>
    );
  }

  const columns = 'grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] gap-x-3';

  return (
    <div>
      <div className="flex border-b border-line bg-panel-2">
        <div className={cx(columns, 'min-w-0 flex-1 px-3')}>
          {header('item', t('orders.item'), 'left')}
          {header('filled', t('orders.filled'), 'right')}
          {header('price', t('orders.price'), 'right')}
        </div>
        {/* Holds the rows' More actions column open, so the headers stay
            over their values. */}
        <span aria-hidden="true" className="mr-1 w-9 shrink-0 md:w-7" />
      </div>
      <ul aria-label={label} className="divide-y divide-line">
        {rows.map((order) => {
          const open = openId === order.order_id;
          const name = nameFor(order.type_id);
          const issued = formatDateOnly(new Date(order.issued), timeZone);
          const row = (
            <li className={cx(open && 'bg-panel-2')}>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : order.order_id)}
                  className={cx(
                    columns,
                    'min-h-13 min-w-0 flex-1 items-center px-3 py-2 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm text-text">{name}</span>
                    <span className="truncate text-xs text-text-dim">
                      {sideLabel(order)} · {stateLabel(order)} · {issued}
                    </span>
                  </span>
                  <span className="text-right text-sm text-text-dim tabular-nums">
                    {filledOf(order).toLocaleString()}/{order.volume_total.toLocaleString()}
                  </span>
                  <span className="text-right text-sm font-semibold text-text tabular-nums">
                    {formatIskCompact(order.price)}
                  </span>
                </button>
                {/* Beside the button, not in it — buttons don't nest. */}
                <RowMoreActions className="mr-1 shrink-0" />
              </div>
              {open && (
                <div className="flex flex-col gap-3 px-3 pt-1 pb-3">
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm tabular-nums">
                    <Field label={t('orders.side')} value={sideLabel(order)} />
                    <Field label={t('orders.state')} value={stateLabel(order)} />
                    <Field
                      label={t('orders.remaining')}
                      value={`${order.volume_remain.toLocaleString()} / ${order.volume_total.toLocaleString()}`}
                    />
                    <Field label={t('orders.issued')} value={issued} />
                    <Field label={t('orders.price')} value={formatIsk(order.price, 2)} />
                  </dl>
                  <MarketItemLink
                    typeId={order.type_id}
                    className={buttonClassName({ variant: 'ghost', className: 'min-h-11 w-full' })}
                  >
                    {t('orders.viewInMarket')}
                  </MarketItemLink>
                </div>
              )}
            </li>
          );
          return (
            <Fragment key={order.order_id}>
              {rowContextMenu ? rowContextMenu(order, row) : row}
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}
