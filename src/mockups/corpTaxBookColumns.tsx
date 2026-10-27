/** Table columns shared by the Corp Tax Book mockups (#4056). */
import { RowCaret, type DataTableColumn } from '@/components/ui';
import { cx } from '@/lib/cx';
import type { DayLine, PaymentLine } from './corpTaxBookFixtures';
import { isk, isk2 } from './corpTaxBookFormat';
import { formatNumber } from '@/lib/numberLocale';

export function caretColumn<T>(): DataTableColumn<T> {
  return {
    id: 'go',
    header: '',
    align: 'right',
    className: 'w-6 max-sm:hidden',
    render: () => <RowCaret />,
  };
}

const DAY_STATUS_TONE: Record<DayLine['status'], string> = {
  'On Aug Statement': 'text-danger',
  'Next Statement': 'text-text',
  'Not Billable yet': 'text-text-dim',
  Dismissed: 'text-text-dim line-through decoration-text-faint',
  Paid: 'text-success',
  'Written off': 'text-text-dim line-through decoration-text-faint',
};

export const dayColumns: DataTableColumn<DayLine>[] = [
  { id: 'date', header: 'Day', render: (row) => row.date, sortValue: (row) => row.id },
  {
    id: 'where',
    header: 'Refinery',
    render: (row) => (
      <span className="block min-w-0">
        {row.refinery}
        <span className="block text-xs text-text-dim">{row.moon}</span>
      </span>
    ),
  },
  { id: 'character', header: 'Character', render: (row) => row.character },
  {
    id: 'ore',
    header: 'Ore',
    primary: true,
    render: (row) => (
      <span>
        {row.ore}
        <span className="text-text-dim"> × {formatNumber(row.units)}</span>
      </span>
    ),
  },
  {
    id: 'price',
    header: 'Unit price',
    align: 'right',
    className: 'tabular-nums',
    phoneHidden: true,
    render: (row) => isk2(row.unitPrice),
  },
  {
    id: 'rate',
    header: 'Rate',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => `${row.rate}%`,
  },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    cellClassName: (row) =>
      row.status === 'Dismissed' || row.status === 'Written off'
        ? 'line-through text-text-dim'
        : '',
    render: (row) => isk(row.tax),
    sortValue: (row) => row.tax,
  },
  {
    id: 'status',
    header: 'Status',
    render: (row) => (
      <span className={cx('text-xs whitespace-nowrap', DAY_STATUS_TONE[row.status])}>
        {row.status}
      </span>
    ),
  },
];

export const paymentColumns: DataTableColumn<PaymentLine>[] = [
  { id: 'date', header: 'When', render: (row) => row.date },
  {
    id: 'from',
    header: 'From',
    primary: true,
    render: (row) => (
      <span>
        {row.from}
        <span className="block text-xs text-text-dim">
          {row.kind}
          {row.by ? ` · ${row.by}` : ''}
        </span>
      </span>
    ),
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    render: (row) => <span className="text-isk-pos">+{isk(row.amount)}</span>,
  },
  {
    id: 'credited',
    header: 'Credited to',
    render: (row) => (
      <span>
        {row.credited}
        {row.notTax ? (
          <span className="block text-xs text-warning">
            {isk(row.notTax)} marked not tax (buyback)
          </span>
        ) : null}
        {row.writtenOff ? (
          <span className="block text-xs text-text-dim">
            Settled within tolerance — {isk(row.writtenOff)} written off (logged)
          </span>
        ) : null}
      </span>
    ),
  },
];
