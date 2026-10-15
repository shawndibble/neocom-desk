import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, Disclosure, SegmentedControl, type DataTableColumn } from '@/components/ui';
import type { RealizedMargin } from '@/engine/market/realizedMargin';
import type { WalletTransaction } from '@/esi/endpoints';
import { iskToneClass } from '@/features/character/format';
import { formatDateOnly } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { signedIsk } from './signedIsk';
import { summarizeTransactions } from './transactionDays';
import { rankItemMargins, rollupMarginsByItem, type ItemMarginRow } from './transactionItemMargins';

interface TransactionsItemRollupProps {
  /** The fills shown, after the date, side and search filters. */
  transactions: readonly WalletTransaction[];
  margins: ReadonlyMap<number, RealizedMargin>;
  nameFor: (typeId: number) => string;
  /** The fetch stopped at the page cap, so older fills are missing. */
  truncated: boolean;
  /** Applies the item as the page's search filter. */
  onSelectItem: (name: string) => void;
}

const itemRowKey = (row: ItemMarginRow) => row.typeId;

/** Market History's "By item" disclosure: the Margin column summed per item over the fills shown. */
export function TransactionsItemRollup({
  transactions,
  margins,
  nameFor,
  truncated,
  onSelectItem,
}: TransactionsItemRollupProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [expanded, setExpanded] = useState(false);
  const [order, setOrder] = useState<'best' | 'worst'>('best');

  const rows = useMemo(
    () => rankItemMargins(rollupMarginsByItem(transactions, margins), order),
    [transactions, margins, order]
  );
  const range = useMemo(() => summarizeTransactions(transactions), [transactions]);

  const columns = useMemo<DataTableColumn<ItemMarginRow>[]>(
    () => [
      { id: 'item', header: t('wallet.item'), stickyStart: true, render: (r) => nameFor(r.typeId) },
      {
        id: 'fills',
        header: t('wallet.fills'),
        align: 'right',
        className: 'tabular-nums',
        render: (r) => r.fills.toLocaleString(),
      },
      {
        id: 'unitsSold',
        header: t('wallet.unitsSold'),
        align: 'right',
        className: 'tabular-nums',
        render: (r) => r.unitsSold.toLocaleString(),
      },
      {
        id: 'margin',
        header: t('wallet.netMargin'),
        headerTooltip: t('wallet.marginTooltip'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (r) => (r.margin === null ? 'text-text-dim' : iskToneClass(r.margin)),
        render: (r) => (r.margin === null ? '—' : signedIsk(r.margin, 0)),
      },
    ],
    [t, nameFor]
  );

  return (
    <Disclosure
      label={t('wallet.byItem')}
      trailing={truncated ? t('wallet.byItemPartial') : undefined}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
    >
      <div className="space-y-2 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {range.oldest && range.newest && (
            <p className="text-xs text-text-dim">
              {t(truncated ? 'wallet.byItemRangeTruncated' : 'wallet.byItemRange', {
                from: formatDateOnly(new Date(range.oldest), timeZone),
                to: formatDateOnly(new Date(range.newest), timeZone),
              })}
            </p>
          )}
          <SegmentedControl
            label={t('wallet.byItemOrder')}
            size="sm"
            value={order}
            onChange={setOrder}
            options={[
              { value: 'best', label: t('wallet.bestFirst') },
              { value: 'worst', label: t('wallet.worstFirst') },
            ]}
          />
        </div>
        <DataTable
          label={t('wallet.byItem')}
          density="compact"
          responsive="table"
          columns={columns}
          rows={rows}
          rowKey={itemRowKey}
          onRowClick={(row) => onSelectItem(nameFor(row.typeId))}
        />
      </div>
    </Disclosure>
  );
}
