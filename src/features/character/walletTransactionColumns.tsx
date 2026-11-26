import type { DataTableColumn } from '@/components/ui';
import {
  COL_DATETIME,
  COL_DATETIME_STACKED,
  COL_ISK,
  COL_QUANTITY,
} from '@/components/ui/dataTableWidths';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import { ItemInfoLink } from '@/features/entities';
import { formatCount } from '@/lib/formatCount';
import { formatMarketIsk } from '@/lib/isk';
import { splitTimestamp } from '@/lib/timestamp';
import type { Translate } from '@/lib/translate';
import { iskToneClass } from './format';
import { transactionTotal } from './walletTransactionsCsv';

export interface WalletTransactionBaseColumnsOptions {
  t: Translate;
  timeZone: string | undefined;
  isPhone: boolean;
  nameFor: (typeId: number) => string;
  widths?: { quantity?: string; unitPrice?: string; total?: string };
  stickyStartOnPanel?: boolean;
}

export function walletTransactionBaseColumns<T extends WalletTransactionCommon>({
  t,
  timeZone,
  isPhone,
  nameFor,
  widths = {},
  stickyStartOnPanel,
}: WalletTransactionBaseColumnsOptions): DataTableColumn<T>[] {
  return [
    {
      id: 'date',
      header: t('wallet.date'),
      width: isPhone ? COL_DATETIME_STACKED : COL_DATETIME,
      className: 'whitespace-nowrap text-text-dim max-sm:px-1',
      headerClassName: 'max-sm:px-1',
      render: (txn) => {
        const { date, time } = splitTimestamp(new Date(txn.date), timeZone);
        const body = date.trimEnd();
        return (
          <>
            <span className="max-sm:block">{body}</span>
            <span className="max-sm:hidden">{date.slice(body.length)}</span>
            {time && <span className="max-sm:block">{time}</span>}
          </>
        );
      },
      sortValue: (txn) => txn.date,
    },
    {
      id: 'item',
      header: t('wallet.item'),
      stickyStart: true,
      stickyStartOnPanel,
      minWidth: '18ch',
      className: 'sm:truncate',
      render: (txn) => (
        <span className="max-sm:line-clamp-2 max-sm:break-words">
          <ItemInfoLink typeId={txn.type_id}>{nameFor(txn.type_id)}</ItemInfoLink>
        </span>
      ),
      sortValue: (txn) => nameFor(txn.type_id),
    },
    {
      id: 'side',
      header: t('wallet.side'),
      width: '7ch',
      render: (txn) => (txn.is_buy ? t('wallet.buy') : t('wallet.sell')),
      sortValue: (txn) => (txn.is_buy ? 0 : 1),
    },
    {
      id: 'quantity',
      header: t('wallet.quantity'),
      width: widths.quantity ?? COL_QUANTITY,
      align: 'right',
      className: 'tabular-nums',
      render: (txn) => formatCount(txn.quantity),
      sortValue: (txn) => txn.quantity,
    },
    {
      id: 'unitPrice',
      header: t('wallet.unitPrice'),
      width: widths.unitPrice ?? COL_ISK,
      align: 'right',
      className: 'tabular-nums',
      render: (txn) => formatMarketIsk(txn.unit_price),
      sortValue: (txn) => txn.unit_price,
    },
    {
      id: 'total',
      header: t('wallet.total'),
      width: widths.total ?? COL_ISK,
      align: 'right',
      className: 'tabular-nums',
      cellClassName: (txn) => iskToneClass(transactionTotal(txn)),
      render: (txn) => formatMarketIsk(transactionTotal(txn)),
      sortValue: (txn) => transactionTotal(txn),
    },
  ];
}
