import { useCallback, useMemo } from 'react';
import { useCharacterCount } from '@/features/character/useCharacters';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  ColumnPickerMenu,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
  Tooltip,
  type DataTableColumn,
  CachedNotice,
} from '@/components/ui';
import { COL_DATETIME, COL_DATETIME_STACKED } from '@/components/ui/dataTableWidths';
import { useIsPhone } from '@/lib/useIsPhone';
import { fitColumnWidth } from './transactionColumnWidths';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { loadWalletJournal, loadWalletTransactionsWithStatus } from '@/features/character/wallet';
import { TransactionsSummaryStrip } from './TransactionsSummaryStrip';
import { TransactionsFilterBar } from '@/features/corp/CorpTransactionsPanel';
import {
  EMPTY_TRANSACTION_FILTER_PARAMS,
  EMPTY_WALLET_TRANSACTION_FILTER,
  filterWalletTransactions,
  TRANSACTION_FIELD_TO_PARAM,
  TRANSACTION_FILTER_PARAMS,
  type WalletTransactionFilter,
} from '@/features/character/walletTransactionFilter';
import { useUrlFilter } from '@/lib/useUrlState';
import { ItemInfoLink, PlaceLink } from '@/features/entities';
import { placeKey, usePlaceDetails, type PlaceRef } from '@/features/places';
import { formatPercent } from '@/features/industry/format';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { iskToneClass } from '@/features/character/format';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatMarketIsk } from '@/lib/isk';
import { splitTimestamp } from '@/lib/timestamp';
import { HintText } from '@/components/ui/HintText';
import type { MarginGap, RealizedMargin } from '@/engine/market/realizedMargin';
import { useTimeZone } from '@/lib/timeFormat';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useColumnVisibility } from '@/lib/columnVisibility';
import {
  DEFAULT_VISIBLE_TRANSACTIONS_COLUMNS,
  TRANSACTIONS_COLUMN_IDS,
  TRANSACTIONS_PHONE_OFF_BY_DEFAULT,
  useVisibleTransactionsColumns,
  type TransactionsColumnId,
} from './transactionsColumns';
import {
  transactionTotal,
  walletTransactionsCsvColumns,
} from '@/features/character/walletTransactionsCsv';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { useResolvedCharacterFilter } from '@/features/character/characterFilterValue';
import { useRememberedUrlParams } from '@/lib/useUrlState';
import {
  pooledTransactionMargins,
  transactionMarginReport,
  type PooledTransaction,
} from './transactionMargins';
import { summarizeTrading } from './tradingSummary';
import { useAllCharacterFills, useArchiveSince } from './useAllCharacterFills';
import { PageHeaderPortals } from './PageHeaderPortals';
import type { PageHeaderSlots } from './pageHeaderSlots';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { highlightedTransactionId } from './transactionHighlight';
import { formatCount } from '@/lib/formatCount';

/** Static keys, so the i18n key scan sees every string. */
const MARGIN_GAP_COPY: Record<MarginGap, { label: string; hint: string }> = {
  noBuy: { label: 'wallet.marginGap.noBuy', hint: 'wallet.marginGapHint.noBuy' },
  noTax: { label: 'wallet.marginGap.noTax', hint: 'wallet.marginGapHint.noTax' },
  outside: { label: 'wallet.marginGap.outside', hint: 'wallet.marginGapHint.outside' },
};

/** The gap label is `text-xs`, so each letter takes about this much of a digit's `ch`. */
const GAP_LABEL_CH_PER_CHAR = 0.85;

const HISTORY_CHARACTER_PARAMS = { 'txn.chars': characterFilterParam('current') };

/** Margin over what the sold units cost, as a percent; null when the sale has no margin. */
function marginPercentOf(
  txn: WalletTransaction,
  margin: RealizedMargin | undefined
): number | null {
  if (!margin) return null;
  const cost = margin.unitCost * txn.quantity;
  return cost > 0 ? (margin.margin / cost) * 100 : null;
}

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_TYPE_NAMES: ReadonlyMap<number, string> = new Map();
const NO_JOURNAL: readonly WalletJournalEntry[] = [];

interface Snapshot {
  transactionsResult: CachedResult<WalletTransaction[]> | null;
  /** 401/403 (or a failed token refresh) means "grant the Wallet Permission", not "offline". */
  transactionsNeedsReauth: boolean;
  /** The fetch stopped at the transactions page cap; older history is missing. */
  transactionsTruncated: boolean;
  typeNames: Map<number, string>;
  /** Only for the Margin column's sales tax lines; null when it couldn't be read. */
  journal: WalletJournalEntry[] | null;
}

async function loadTransactionsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  // A journal that fails to load only blanks the Margin column, never the tab.
  const [{ cached: transactionsResult, needsReauth: transactionsNeedsReauth }, journalResult] =
    await Promise.all([
      loadWalletTransactionsWithStatus(characterId),
      loadWalletJournal(characterId).catch(() => null),
    ]);
  const transactionsTruncated = transactionsResult?.truncated ?? false;
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  const typeIds = signal.cancelled
    ? []
    : [...new Set((transactionsResult?.data ?? []).map((txn) => txn.type_id))];
  const typeNames = await loadTypeNames(typeIds);
  return {
    transactionsResult,
    transactionsNeedsReauth,
    transactionsTruncated,
    typeNames,
    journal: journalResult?.data ?? null,
  };
}

/** Module-level so the table's windowing and row memo see one stable function. */
const transactionRowKey = (txn: WalletTransaction) => txn.transaction_id;

/**
 * Market's History tab: a character's recent buy/sell fills. Personal only:
 * the corporation's fills live on `/corp/wallet`, beside the corp journal
 * they reconcile against.
 */
interface TransactionsPanelProps {
  headerSlots: PageHeaderSlots;
}

export function TransactionsPanel({ headerSlots }: TransactionsPanelProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const isPhone = useIsPhone();
  const { data, error, loading, hydrated, activeCharacterId, refreshCount, refresh } =
    useRouteSnapshot(loadTransactionsSnapshot, undefined, { cacheKey: 'market:transactions' });
  const highlightTypeId = useHighlightParam();

  // This Character / All characters (issue #3995). Hidden for a one-Character account.
  const rememberedCharacterFilter = useRememberedCharacterFilter<typeof HISTORY_CHARACTER_PARAMS>(
    'transactions',
    'txn.chars'
  );
  const [characterValues, setCharacterValues] = useRememberedUrlParams(
    HISTORY_CHARACTER_PARAMS,
    rememberedCharacterFilter
  );
  const characterFilter = characterValues['txn.chars'];
  const resolvedCharacterFilter = useResolvedCharacterFilter(characterFilter, activeCharacterId);
  const characterCount = useCharacterCount();
  const showCharacterFilter = characterCount > 1;
  const allScope = showCharacterFilter && resolvedCharacterFilter === 'all';
  const allFills = useAllCharacterFills(allScope, refreshCount);
  const singleArchiveSince = useArchiveSince(activeCharacterId);
  const pooled = useMemo(
    () => (allFills.status === 'ready' ? pooledTransactionMargins(allFills.data.fills) : null),
    [allFills]
  );
  const transactionsResult = data?.transactionsResult ?? null;
  const transactionsNeedsReauth = data?.transactionsNeedsReauth ?? false;
  const transactionsTruncated = allScope
    ? allFills.status === 'ready' && allFills.data.truncated
    : (data?.transactionsTruncated ?? false);
  const typeNames =
    (allScope ? (allFills.status === 'ready' ? allFills.data.typeNames : null) : data?.typeNames) ??
    NO_TYPE_NAMES;
  const nameFor = useCallback(
    (typeId: number) => typeNames.get(typeId) ?? `Type #${typeId}`,
    [typeNames]
  );

  const transactions = useMemo<WalletTransaction[]>(
    () =>
      [...(allScope ? (pooled?.rows ?? []) : (transactionsResult?.data ?? []))].sort((a, b) =>
        b.date.localeCompare(a.date)
      ),
    [allScope, pooled, transactionsResult]
  );
  const journal = useMemo(
    () =>
      allScope
        ? allFills.status === 'ready'
          ? allFills.data.fills.flatMap((f) => f.journal)
          : NO_JOURNAL
        : (data?.journal ?? NO_JOURNAL),
    [allScope, allFills, data]
  );
  // Worked out over every fill, not the filtered rows — a filter must not change what a sale cost.
  const { margins, gaps } = useMemo(
    () =>
      allScope && pooled ? pooled : transactionMarginReport(allScope ? [] : transactions, journal),
    [allScope, pooled, transactions, journal]
  );
  const archiveSince = allScope
    ? allFills.status === 'ready'
      ? allFills.data.archiveSince
      : null
    : singleArchiveSince;

  // One filter bar on this tab, so the scope key never changes and the
  // filter never needs `useUrlFilter`'s scope-reset.
  const [filter, setFilter, rowsFilter] = useUrlFilter<WalletTransactionFilter>(
    'transactions',
    TRANSACTION_FILTER_PARAMS,
    TRANSACTION_FIELD_TO_PARAM,
    EMPTY_TRANSACTION_FILTER_PARAMS
  );
  const filteredTransactions = useMemo(
    () => filterWalletTransactions(transactions, rowsFilter, nameFor),
    [transactions, rowsFilter, nameFor]
  );
  const trading = useMemo(
    () => summarizeTrading(filteredTransactions, margins, journal, rowsFilter, archiveSince, gaps),
    [filteredTransactions, margins, gaps, journal, rowsFilter, archiveSince]
  );
  const csvColumns = useMemo(() => walletTransactionsCsvColumns(t, nameFor), [t, nameFor]);
  const transactionsExport = useTableExport({
    surface: 'wallet-transactions',
    rows: filteredTransactions,
    columns: csvColumns,
    truncated: transactionsTruncated,
  });

  /**
   * The alert names the *item*; the table is keyed by transaction. Resolving
   * one to the other is this panel's job because only it knows that rule —
   * the newest sell of that item (`transactionHighlight.ts`).
   */
  const highlightId = useMemo(
    () => highlightedTransactionId(transactions, highlightTypeId),
    [transactions, highlightTypeId]
  );

  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleTransactionsColumns,
    DEFAULT_VISIBLE_TRANSACTIONS_COLUMNS,
    TRANSACTIONS_PHONE_OFF_BY_DEFAULT
  );
  // Names only while Location is ticked: a structure's name is a lookup each.
  const locationOn = isVisible('location');
  // Under All a fill's place is asked as the Character that made it, since a
  // structure's name is ACL-checked per Character.
  const placeOwnerOf = useCallback(
    (txn: WalletTransaction) =>
      allScope ? (txn as PooledTransaction).characterId : activeCharacterId,
    [allScope, activeCharacterId]
  );
  const placeRefs = useMemo<PlaceRef[]>(() => {
    if (!locationOn) return [];
    const byKey = new Map<string, PlaceRef>();
    for (const txn of filteredTransactions) {
      const ref = { locationId: txn.location_id, characterId: placeOwnerOf(txn) };
      byKey.set(placeKey(ref), ref);
    }
    return [...byKey.values()];
  }, [locationOn, filteredTransactions, placeOwnerOf]);
  const placeDetails = usePlaceDetails(placeRefs, {
    scopeId: activeCharacterId,
    enabled: locationOn,
    origin: null,
    basis: null,
  });
  const placeNameFor = useCallback(
    (txn: WalletTransaction) =>
      placeDetails.get(placeKey({ locationId: txn.location_id, characterId: placeOwnerOf(txn) }))
        ?.name ?? t('wallet.locationFallback', { id: txn.location_id }),
    [placeDetails, placeOwnerOf, t]
  );

  // Number columns fit the loaded rows, not a worst case; see `fitColumnWidth`.
  const numberWidths = useMemo(() => {
    const chars = (pick: (txn: WalletTransaction) => number | null) =>
      transactions.map((txn) => {
        const value = pick(txn);
        return value === null ? 1 : formatMarketIsk(value).length;
      });
    const marginOf = (txn: WalletTransaction) =>
      txn.is_buy ? null : (margins.get(txn.transaction_id)?.margin ?? null);
    const gapChars = transactions.flatMap((txn) => {
      const gap = gaps.get(txn.transaction_id);
      return !txn.is_buy && gap && !margins.has(txn.transaction_id)
        ? [Math.ceil(t(MARGIN_GAP_COPY[gap].label).length * GAP_LABEL_CH_PER_CHAR)]
        : [];
    });
    return {
      quantity: fitColumnWidth(
        transactions.map((txn) => formatCount(txn.quantity).length),
        t('wallet.quantity')
      ),
      unitPrice: fitColumnWidth(
        chars((txn) => txn.unit_price),
        t('wallet.unitPrice')
      ),
      total: fitColumnWidth(chars(transactionTotal), t('wallet.total')),
      margin: fitColumnWidth([...chars(marginOf), ...gapChars], t('wallet.margin')),
      unitCost: fitColumnWidth(
        chars((txn) => (txn.is_buy ? null : (margins.get(txn.transaction_id)?.unitCost ?? null))),
        t('wallet.unitCost')
      ),
    };
  }, [transactions, margins, gaps, t]);

  const columns = useMemo<DataTableColumn<WalletTransaction>[]>(
    () => [
      {
        id: 'date',
        header: t('wallet.date'),
        // Stacked date over time below `sm` (see render), one line from there up.
        width: isPhone ? COL_DATETIME_STACKED : COL_DATETIME,
        className: 'whitespace-nowrap text-text-dim max-sm:px-1',
        headerClassName: 'max-sm:px-1',
        // Date over time on a phone, freeing width for the other columns; one line from `sm` up.
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
      ...(allScope
        ? [
            {
              id: 'character',
              header: t('wallet.character'),
              phoneHidden: true,
              width: '22ch',
              className: 'truncate',
              render: (txn: WalletTransaction) => (txn as PooledTransaction).characterName,
              sortValue: (txn: WalletTransaction) => (txn as PooledTransaction).characterName,
            } satisfies DataTableColumn<WalletTransaction>,
          ]
        : []),
      {
        id: 'item',
        header: t('wallet.item'),
        stickyStart: true,
        // Takes the width the number columns leave; never under ~18ch, so names wrap on words.
        minWidth: '18ch',
        // Wraps to two lines on a phone rather than truncating to "Repu…".
        className: 'sm:truncate',
        render: (txn) => (
          <span className="max-sm:line-clamp-2 max-sm:break-words">
            <ItemInfoLink typeId={txn.type_id}>
              {typeNames.get(txn.type_id) ?? `Type #${txn.type_id}`}
            </ItemInfoLink>
          </span>
        ),
        sortValue: (txn) => nameFor(txn.type_id),
      },
      {
        id: 'side',
        header: t('wallet.side'),
        width: '7ch',
        // The Total's sign and tone already say buy or sell (off by default on a phone).
        render: (txn) => (txn.is_buy ? t('wallet.buy') : t('wallet.sell')),
        sortValue: (txn) => (txn.is_buy ? 0 : 1),
      },
      {
        id: 'quantity',
        header: t('wallet.quantity'),
        width: numberWidths.quantity,
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => formatCount(txn.quantity),
        sortValue: (txn) => txn.quantity,
      },
      {
        id: 'unitPrice',
        header: t('wallet.unitPrice'),
        width: numberWidths.unitPrice,
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => formatMarketIsk(txn.unit_price),
        sortValue: (txn) => txn.unit_price,
      },
      {
        id: 'total',
        header: t('wallet.total'),
        width: numberWidths.total,
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (txn) => iskToneClass(transactionTotal(txn)),
        render: (txn) => formatMarketIsk(transactionTotal(txn)),
        sortValue: (txn) => transactionTotal(txn),
      },
      {
        id: 'margin',
        header: t('wallet.margin'),
        headerTooltip: t('wallet.marginTooltip'),
        width: numberWidths.margin,
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (txn) => {
          const margin = margins.get(txn.transaction_id);
          return margin ? iskToneClass(margin.margin) : 'text-text-dim';
        },
        render: (txn) => {
          if (txn.is_buy) return null;
          const margin = margins.get(txn.transaction_id);
          if (!margin) {
            const gap = gaps.get(txn.transaction_id);
            if (!gap) return '—';
            return (
              <HintText content={t(MARGIN_GAP_COPY[gap].hint)}>
                <span className="text-xs text-text-dim">{t(MARGIN_GAP_COPY[gap].label)}</span>
              </HintText>
            );
          }
          return (
            <Tooltip
              content={t('wallet.marginWorking', {
                unitCost: formatMarketIsk(margin.unitCost),
                salesTax: formatMarketIsk(margin.salesTax),
              })}
            >
              <span>{formatMarketIsk(margin.margin)}</span>
            </Tooltip>
          );
        },
        sortValue: (txn) => margins.get(txn.transaction_id)?.margin,
      },
      {
        id: 'marginPercent',
        header: t('wallet.marginPercent'),
        headerTooltip: t('wallet.marginPercentTooltip'),
        width: '11ch',
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (txn) => {
          const margin = margins.get(txn.transaction_id);
          return margin ? iskToneClass(margin.margin) : 'text-text-dim';
        },
        render: (txn) => {
          if (txn.is_buy) return null;
          const percent = marginPercentOf(txn, margins.get(txn.transaction_id));
          return percent === null ? '—' : formatPercent(percent);
        },
        sortValue: (txn) => marginPercentOf(txn, margins.get(txn.transaction_id)) ?? undefined,
      },
      {
        id: 'unitCost',
        header: t('wallet.unitCost'),
        headerTooltip: t('wallet.unitCostTooltip'),
        width: numberWidths.unitCost,
        align: 'right',
        className: 'tabular-nums',
        render: (txn) => {
          if (txn.is_buy) return null;
          const margin = margins.get(txn.transaction_id);
          return margin ? formatMarketIsk(margin.unitCost) : '—';
        },
        sortValue: (txn) => margins.get(txn.transaction_id)?.unitCost,
      },
      {
        id: 'location',
        header: t('wallet.location'),
        className: 'truncate',
        render: (txn) => <PlaceLink id={txn.location_id}>{placeNameFor(txn)}</PlaceLink>,
        sortValue: (txn) => placeNameFor(txn),
      },
    ],
    [t, typeNames, timeZone, nameFor, margins, gaps, allScope, placeNameFor, isPhone, numberWidths]
  );

  const columnsById = useMemo(
    () =>
      Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
        TransactionsColumnId,
        DataTableColumn<WalletTransaction>
      >,
    [columns]
  );
  // Filtered only at the table's input, so a sort on a hidden column survives
  // until it returns.
  const shownColumns = useMemo(
    () =>
      columns.filter(
        (column) =>
          !(TRANSACTIONS_COLUMN_IDS as readonly string[]).includes(column.id) ||
          isVisible(column.id as TransactionsColumnId)
      ),
    [columns, isVisible]
  );

  // The picker rides in the page header in every state (loading, error, empty),
  // so a pilot can always switch scope out of a dead end.
  const headerChrome = (
    <PageHeaderPortals
      slots={headerSlots}
      meta={transactionsResult && <DataAgeBadge date={transactionsResult.fetchedAt} />}
      scope={
        showCharacterFilter && (
          <CharacterFilterControl
            activeCharacterId={activeCharacterId}
            value={characterFilter}
            characterCount={characterCount}
            loading={allScope && allFills.status === 'loading'}
            // Who "All" leaves out (no wallet grant): the trigger's dot and menu note.
            missingNames={
              allScope && allFills.status === 'ready'
                ? allFills.data.skipped.map((c) => c.name)
                : undefined
            }
            onChange={(next) => setCharacterValues({ 'txn.chars': next })}
          />
        )
      }
      actions={
        <>
          {/* Export before Refresh, as on every header (DESIGN.md §6c Header controls). */}
          {transactionsResult && (
            <TableActionsMenu
              name={t('market.sections.transactions')}
              tableExport={transactionsExport}
              size="md"
            />
          )}
          <IconButton icon={<Icon.Refresh />} label={t('wallet.refresh')} onClick={refresh} />
        </>
      }
    />
  );

  if (!hydrated) {
    return (
      <>
        {headerChrome}
        <Spinner block="page" label={t('common.loading')} />
      </>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  if (allScope && allFills.status === 'loading') {
    return (
      <>
        {headerChrome}
        <Spinner block="page" label={t('common.loading')} />
      </>
    );
  }
  if (loading && !data) {
    return (
      <>
        {headerChrome}
        <Spinner block="page" label={t('common.loading')} />
      </>
    );
  }
  if (error || (allScope && allFills.status === 'failed')) {
    return (
      <>
        {headerChrome}
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      </>
    );
  }

  const hasRows = (allScope || !transactionsNeedsReauth) && transactions.length > 0;

  return (
    <div className="space-y-4">
      {headerChrome}
      {hasRows && filteredTransactions.length > 0 && (
        <TransactionsSummaryStrip transactions={filteredTransactions} trading={trading} />
      )}
      <Panel padded={false}>
        {!allScope && transactionsNeedsReauth ? (
          <div className="px-3 py-2">
            <GrantBanner
              characterId={activeCharacterId}
              endpoints={['getCharacterWalletTransactions']}
              title={t('wallet.transactionsReauthTitle')}
              hint={t('wallet.transactionsReauthHint')}
              actionLabel={t('wallet.reauthAction')}
            />
          </div>
        ) : !(allScope || transactionsResult) || !hasRows ? (
          <CachedEmptyState
            result={allScope ? null : transactionsResult}
            title={t('wallet.transactionsEmptyTitle')}
            hint={t('wallet.transactionsEmptyHint')}
            fetchedTitle={t('wallet.transactionsEmptyFetchedTitle')}
            className="py-8"
          />
        ) : (
          <>
            {!allScope && transactionsResult?.fromCache && (
              <CachedNotice
                className="px-3 pt-2"
                fetchedAt={transactionsResult.fetchedAt}
                refreshFailed={refreshCount > 0}
              />
            )}
            {transactionsTruncated && (
              <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                {t('common.incompleteTitle')} — {t('wallet.transactionsTruncatedHint')}
              </p>
            )}
            <TransactionsFilterBar
              filter={filter}
              onChange={setFilter}
              actions={
                <ColumnPickerMenu
                  available={TRANSACTIONS_COLUMN_IDS}
                  visible={visible}
                  columnsById={columnsById}
                  onToggle={toggle}
                  onReset={reset}
                  buttonLabel={t('common.columnsButton')}
                  menuTitle={t('common.columnsMenuTitle')}
                  resetLabel={t('common.resetColumns')}
                />
              }
            />
            {filteredTransactions.length === 0 ? (
              <EmptyState
                title={t('wallet.transactionsNoFilterMatches')}
                hint={t('wallet.transactionsNoFilterMatchesHint')}
                className="py-8"
                action={
                  <Button size="sm" onClick={() => setFilter(EMPTY_WALLET_TRANSACTION_FILTER)}>
                    {t('common.resetFilters')}
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  {...transactionsExport.tableProps}
                  label={t('wallet.transactionsTab')}
                  columns={shownColumns}
                  rows={filteredTransactions}
                  rowKey={transactionRowKey}
                  highlightRowKey={highlightId}
                  virtualize="auto"
                  hugColumns
                  responsive="table"
                  // `transactions` already arrives newest-first (the `sort` above) —
                  // matches that so a header click is the first thing that reorders it.
                  defaultSort={{ columnId: 'date', direction: 'desc' }}
                />
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
