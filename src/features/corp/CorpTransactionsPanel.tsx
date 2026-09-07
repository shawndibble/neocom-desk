/**
 * The corp wallet's Transactions tab (issue #570).
 *
 * The corp side of `/wallet` could say that 4.2b left the SRP division and not
 * what it bought: the journal names a market escrow, the fills are a separate
 * ESI read, and only the character's were registered. This panel is the other
 * half of that reconciliation, one division at a time like everything else on
 * this page.
 *
 * Its own module rather than another branch inside `routes/Wallet.tsx`, which
 * is already the longest route in the app. It owns no fetching and no filter
 * state — the route holds both, so a division switch resets the filter in the
 * same place it resets the journal's (see `Wallet.tsx`).
 *
 * A filter bar, unlike the character panel in Market. That asymmetry is
 * deliberate for now: a corp division's fills are the many-Characters case, so
 * "what did we buy last Tuesday" is a question worth a control, and the
 * character view answers a much smaller list.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  DateRangeFields,
  EmptyState,
  FilterBar,
  FilterField,
  IconButton,
  Panel,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import {
  activeWalletTransactionFilterCount,
  type TransactionSide,
  type WalletTransactionFilter,
} from '@/features/character/walletTransactionFilter';
import {
  transactionTotal,
  walletTransactionsCsvColumns,
} from '@/features/character/walletTransactionsCsv';
import { iskToneClass } from '@/features/character/format';
import { downloadCsv } from '@/lib/downloadCsv';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import type { CachedResult } from '@/esi/cache';
import type { CorporationWalletTransaction } from '@/esi/endpoints';

interface CorpTransactionsPanelProps {
  /** `null` means the read never came back and no cache stood in for it. */
  transactionsResult: CachedResult<CorporationWalletTransaction[]> | null;
  /** Everything this division has, before the filter. */
  transactions: readonly CorporationWalletTransaction[];
  /** Already filtered by the route, so the table and the CSV agree by construction. */
  filteredTransactions: readonly CorporationWalletTransaction[];
  loading: boolean;
  filter: WalletTransactionFilter;
  onFilterChange: (filter: WalletTransactionFilter) => void;
  /** The same spelling the table's item column draws, for the CSV and the search. */
  nameFor: (typeId: number) => string;
  /** Names the CSV file's division, when the division list has loaded. */
  divisionQualifier: string | undefined;
  offlineTitleKey: string;
}

/** Radix needs a value here, and `''` reads to it as "nothing selected". */
const SIDE_OPTIONS: readonly TransactionSide[] = ['all', 'buy', 'sell'];

const SIDE_LABEL: Record<TransactionSide, string> = {
  all: 'wallet.sideFilterAll',
  buy: 'wallet.buy',
  sell: 'wallet.sell',
};

function TransactionsFilterBar({
  filter,
  onChange,
}: {
  filter: WalletTransactionFilter;
  onChange: (filter: WalletTransactionFilter) => void;
}) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeWalletTransactionFilterCount(filter)}
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('wallet.transactionsSearchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('wallet.sideFilterLabel')}>
            <Select
              value={draft.side}
              onValueChange={(value) => setDraft({ ...draft, side: value as TransactionSide })}
            >
              <SelectTrigger aria-label={t('wallet.sideFilterLabel')} className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIDE_OPTIONS.map((side) => (
                  <SelectItem key={side} value={side}>
                    {t(SIDE_LABEL[side])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <DateRangeFields
            from={draft.startDate}
            to={draft.endDate}
            onFromChange={(value) => setDraft({ ...draft, startDate: value })}
            onToChange={(value) => setDraft({ ...draft, endDate: value })}
            fromLabel={t('wallet.dateFromLabel')}
            toLabel={t('wallet.dateToLabel')}
          />
        </>
      )}
    </FilterBar>
  );
}

export function CorpTransactionsPanel({
  transactionsResult,
  transactions,
  filteredTransactions,
  loading,
  filter,
  onFilterChange,
  nameFor,
  divisionQualifier,
  offlineTitleKey,
}: CorpTransactionsPanelProps) {
  const { t } = useTranslation();

  // The same six columns Market's character panel draws, and in the same
  // order: the two tables answer the same question about different wallets,
  // and a manager reconciling one against the other should not have to find
  // the columns twice.
  const columns = useMemo<DataTableColumn<CorporationWalletTransaction>[]>(
    () => [
      {
        id: 'date',
        header: t('wallet.date'),
        className: 'whitespace-nowrap text-text-dim',
        render: (txn) => formatTimestamp(new Date(txn.date)),
        sortValue: (txn) => txn.date,
      },
      {
        id: 'item',
        header: t('wallet.item'),
        /** Titles the card on a phone — the item is what the transaction is. */
        primary: true,
        render: (txn) => (
          <MarketItemLink typeId={txn.type_id}>{nameFor(txn.type_id)}</MarketItemLink>
        ),
        sortValue: (txn) => nameFor(txn.type_id),
      },
      {
        id: 'side',
        header: t('wallet.side'),
        render: (txn) => (txn.is_buy ? t('wallet.buy') : t('wallet.sell')),
        sortValue: (txn) => (txn.is_buy ? 0 : 1),
      },
      {
        id: 'quantity',
        header: t('wallet.quantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => txn.quantity.toLocaleString(),
        sortValue: (txn) => txn.quantity,
      },
      {
        id: 'unitPrice',
        header: t('wallet.unitPrice'),
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => formatIsk(txn.unit_price, 2),
        sortValue: (txn) => txn.unit_price,
      },
      {
        id: 'total',
        header: t('wallet.total'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (txn) => iskToneClass(transactionTotal(txn)),
        render: (txn) => formatIsk(transactionTotal(txn), 2),
        sortValue: (txn) => transactionTotal(txn),
      },
    ],
    [t, nameFor]
  );

  return (
    <Panel
      padded={false}
      title={t('wallet.transactionsTab')}
      actions={
        transactionsResult ? (
          <span className="flex items-center gap-2">
            <IconButton
              size="sm"
              icon={<Icon.Download />}
              label={t('wallet.exportCsvTransactions')}
              disabled={filteredTransactions.length === 0}
              onClick={() =>
                downloadCsv(
                  'corp-wallet-transactions',
                  // Newest first, the order the table opens in — the export
                  // sorts its own copy because it bypasses `DataTable`.
                  [...filteredTransactions].sort((a, b) => b.date.localeCompare(a.date)),
                  walletTransactionsCsvColumns(t, nameFor),
                  new Date(),
                  transactionsResult.truncated,
                  divisionQualifier
                )
              }
            />
            <DataAgeBadge date={transactionsResult.fetchedAt} />
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : transactionsResult === null ? (
        // No cache and the read didn't come back — offline, or a 403 the role
        // gate swallowed, which corp views hide rather than lock.
        <EmptyState
          title={t('common.loadFailedTitle')}
          hint={t('common.loadFailedHint')}
          className="py-8"
        />
      ) : transactions.length === 0 ? (
        // "This division has never traded" — a different answer from "nothing
        // matches your filters" below, so the filter bar stays off screen here
        // rather than inviting the user to adjust a filter that isn't the
        // reason the table is empty.
        <EmptyState
          title={t('wallet.corpTransactionsEmptyTitle')}
          hint={t('wallet.corpTransactionsEmptyHint')}
          className="py-8"
        />
      ) : (
        <>
          {transactionsResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t(offlineTitleKey)}
            </p>
          )}
          {transactionsResult.truncated && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')} — {t('wallet.transactionsTruncatedHint')}
            </p>
          )}
          <TransactionsFilterBar filter={filter} onChange={onFilterChange} />
          {filteredTransactions.length === 0 ? (
            <EmptyState title={t('wallet.transactionsNoFilterMatches')} className="py-8" />
          ) : (
            <DataTable
              label={t('wallet.transactionsTab')}
              columns={columns}
              rows={filteredTransactions}
              rowKey={(txn) => txn.transaction_id}
              defaultSort={{ columnId: 'date', direction: 'desc' }}
            />
          )}
        </>
      )}
    </Panel>
  );
}
