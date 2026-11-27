import { useCallback, useMemo } from 'react';
import { useCharacterCount, useCharacterNames } from '@/features/character/useCharacters';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  ColumnPickerMenu,
  EmptyState,
  SegmentedControl,
  IconButton,
  Panel,
  Spinner,
  Tooltip,
  type DataTableColumn,
  type DataTableGroupBy,
  CachedNotice,
  IncompleteNotice,
} from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import { fitColumnWidth } from './transactionColumnWidths';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { loadWalletJournal, loadWalletTransactionsWithStatus } from '@/features/character/wallet';
import { TransactionsSummaryStrip } from './TransactionsSummaryStrip';
import { TransactionsFilterBar } from '@/features/character/TransactionsFilterBar';
import { walletTransactionBaseColumns } from '@/features/character/walletTransactionColumns';
import {
  EMPTY_TRANSACTION_FILTER_PARAMS,
  EMPTY_WALLET_TRANSACTION_FILTER,
  filterWalletTransactions,
  TRANSACTION_FIELD_TO_PARAM,
  TRANSACTION_FILTER_PARAMS,
  type WalletTransactionFilter,
} from '@/features/character/walletTransactionFilter';
import { useUrlFilter } from '@/lib/useUrlState';
import { PlaceLink } from '@/features/entities';
import { placeKey, usePlaceDetails, type PlaceRef } from '@/features/places';
import { formatPercent } from '@/features/industry/format';
import type { CachedResult } from '@/esi/cache';
import { loadTypeNames } from '@/features/character/typeNames';
import { iskToneClass } from '@/features/character/format';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatMarketIsk } from '@/lib/isk';
import { HintText } from '@/components/ui/HintText';
import type { MarginGap } from '@/engine/market/realizedMargin';
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
  marginPercentOf,
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
import { summarizeTransactions } from './transactionDays';
import { StationSortMenu } from './StationSortMenu';
import { compareStationGroups, distinctLocationIds, stationGroupKey } from './stationGroups';
import { signedIsk } from '@/lib/signedIsk';
import { useAllCharacterFills, useArchiveSince } from './useAllCharacterFills';
import { PageHeaderPortals } from './PageHeaderPortals';
import type { PageHeaderSlots } from './pageHeaderSlots';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { highlightedTransactionId } from './transactionHighlight';
import { formatCount } from '@/lib/formatCount';

const MARGIN_GAP_COPY: Record<MarginGap, { label: string; hint: string }> = {
  noBuy: { label: 'wallet.marginGap.noBuy', hint: 'wallet.marginGapHint.noBuy' },
  noTax: { label: 'wallet.marginGap.noTax', hint: 'wallet.marginGapHint.noTax' },
  outside: { label: 'wallet.marginGap.outside', hint: 'wallet.marginGapHint.outside' },
};

const GAP_LABEL_CH_PER_CHAR = 0.85;

const HISTORY_CHARACTER_PARAMS = { 'txn.chars': characterFilterParam('current') };

const NO_TYPE_NAMES: ReadonlyMap<number, string> = new Map();
const NO_JOURNAL: readonly WalletJournalEntry[] = [];

interface Snapshot {
  transactionsResult: CachedResult<WalletTransaction[]> | null;
  transactionsNeedsReauth: boolean;
  transactionsTruncated: boolean;
  typeNames: Map<number, string>;
  journal: WalletJournalEntry[] | null;
}

async function loadTransactionsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [{ cached: transactionsResult, needsReauth: transactionsNeedsReauth }, journalResult] =
    await Promise.all([
      loadWalletTransactionsWithStatus(characterId, { archive: true }),
      loadWalletJournal(characterId, { archive: true }).catch(() => null),
    ]);
  const transactionsTruncated = transactionsResult?.truncated ?? false;
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

const transactionRowKey = (txn: WalletTransaction) => txn.transaction_id;

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
  const highlightId = useMemo(
    () => highlightedTransactionId(transactions, highlightTypeId),
    [transactions, highlightTypeId]
  );

  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleTransactionsColumns,
    DEFAULT_VISIBLE_TRANSACTIONS_COLUMNS,
    TRANSACTIONS_PHONE_OFF_BY_DEFAULT
  );
  const placeOwnerOf = useCallback(
    (txn: WalletTransaction) =>
      allScope ? (txn as PooledTransaction).characterId : activeCharacterId,
    [allScope, activeCharacterId]
  );
  const placeRefs = useMemo<PlaceRef[]>(() => {
    const byKey = new Map<string, PlaceRef>();
    for (const txn of transactions) {
      const ref = { locationId: txn.location_id, characterId: placeOwnerOf(txn) };
      byKey.set(placeKey(ref), ref);
    }
    return [...byKey.values()];
  }, [transactions, placeOwnerOf]);
  const placeDetails = usePlaceDetails(placeRefs, {
    scopeId: activeCharacterId,
    enabled: placeRefs.length > 0,
    origin: null,
    basis: null,
  });
  const placeNameFor = useCallback(
    (txn: WalletTransaction) =>
      placeDetails.get(placeKey({ locationId: txn.location_id, characterId: placeOwnerOf(txn) }))
        ?.name ?? t('wallet.locationFallback', { id: txn.location_id }),
    [placeDetails, placeOwnerOf, t]
  );

  const characterNames = useCharacterNames();
  const csvColumns = useMemo(
    () =>
      walletTransactionsCsvColumns<WalletTransaction>(t, nameFor, {
        character: (txn) =>
          allScope
            ? (txn as PooledTransaction).characterName
            : (characterNames.get(activeCharacterId ?? 0) ?? null),
        location: placeNameFor,
        margins: { margins, gaps },
      }),
    [t, nameFor, allScope, characterNames, activeCharacterId, placeNameFor, margins, gaps]
  );
  const transactionsExport = useTableExport({
    surface: 'wallet-transactions',
    rows: filteredTransactions,
    columns: csvColumns,
    truncated: transactionsTruncated,
  });

  const stationNames = useMemo(() => {
    const names = new Map<number, string>();
    for (const txn of transactions) {
      if (!names.has(txn.location_id)) names.set(txn.location_id, placeNameFor(txn));
    }
    return names;
  }, [transactions, placeNameFor]);
  const stationNameOf = useCallback(
    (locationId: number) =>
      stationNames.get(locationId) ?? t('wallet.locationFallback', { id: locationId }),
    [stationNames, t]
  );
  const stationOptions = useMemo(
    () =>
      distinctLocationIds(transactions)
        .map((id) => ({ id, label: stationNameOf(id) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [transactions, stationNameOf]
  );
  const byStation = rowsFilter.view === 'station';
  const stationGroupBy = useMemo<DataTableGroupBy<WalletTransaction> | undefined>(
    () =>
      byStation
        ? {
            key: stationGroupKey,
            allWidths: true,
            minSize: 1,
            defaultExpanded: () => true,
            groupCompare: compareStationGroups(rowsFilter.stationsBy, stationNameOf),
            renderHeader: (rows) => {
              const { sold, bought, net } = summarizeTransactions(rows);
              return (
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 tabular-nums">
                  <span className="font-medium text-text">
                    {stationNameOf(rows[0]?.location_id ?? 0)}
                  </span>
                  <span className="text-text-dim">
                    {t('wallet.stationTrades', { count: rows.length })}
                  </span>
                  <span>
                    {t('wallet.sold')} {signedIsk(sold, 0)}
                  </span>
                  <span>
                    {t('wallet.bought')} {signedIsk(-bought, 0)}
                  </span>
                  <span className={iskToneClass(net)}>
                    {t('wallet.net')} {signedIsk(net, 0)}
                  </span>
                </span>
              );
            },
          }
        : undefined,
    [byStation, rowsFilter.stationsBy, stationNameOf, t]
  );

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

  const columns = useMemo<DataTableColumn<WalletTransaction>[]>(() => {
    const [date, ...base] = walletTransactionBaseColumns<WalletTransaction>({
      t,
      timeZone,
      isPhone,
      nameFor,
      widths: numberWidths,
      stickyStartOnPanel: true,
    });
    return [
      date,
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
      ...base,
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
    ];
  }, [t, timeZone, nameFor, margins, gaps, allScope, placeNameFor, isPhone, numberWidths]);

  const columnsById = useMemo(
    () =>
      Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
        TransactionsColumnId,
        DataTableColumn<WalletTransaction>
      >,
    [columns]
  );
  const shownColumns = useMemo(
    () =>
      columns.filter(
        (column) =>
          !(TRANSACTIONS_COLUMN_IDS as readonly string[]).includes(column.id) ||
          isVisible(column.id as TransactionsColumnId)
      ),
    [columns, isVisible]
  );

  const headerChrome = (
    <PageHeaderPortals
      slots={headerSlots}
      meta={
        transactionsResult && (
          <DataAgeBadge
            date={transactionsResult.fetchedAt}
            expiresAt={transactionsResult.expiresAt}
          />
        )
      }
      scope={
        showCharacterFilter && (
          <CharacterFilterControl
            activeCharacterId={activeCharacterId}
            value={characterFilter}
            characterCount={characterCount}
            loading={allScope && allFills.status === 'loading'}
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
        <TransactionsSummaryStrip
          transactions={filteredTransactions}
          trading={trading}
          range={rowsFilter}
        />
      )}
      <Panel padded={false}>
        {!allScope && transactionsNeedsReauth ? (
          <div className="px-3 py-2">
            <GrantBanner
              characterId={activeCharacterId}
              endpoints={['getCharacterWalletTransactions']}
            />
          </div>
        ) : !(allScope || transactionsResult) || !hasRows ? (
          <CachedEmptyState
            result={allScope ? null : transactionsResult}
            title={t('wallet.transactionsEmptyTitle')}
            hint={t('wallet.transactionsEmptyHint')}
            fetchedTitle={t('wallet.transactionsEmptyFetchedTitle')}
            fetchedHint={t('wallet.transactionsEmptyFetchedHint')}
            className="py-8"
          />
        ) : (
          <>
            {!allScope && transactionsResult?.fromCache && (
              <CachedNotice
                withBadge
                className="px-3 pt-2"
                fetchedAt={transactionsResult.fetchedAt}
                refreshFailed={refreshCount > 0}
              />
            )}
            {transactionsTruncated && (
              <IncompleteNotice
                className="px-3 pt-2"
                hint={t('wallet.transactionsTruncatedHint')}
              />
            )}
            <TransactionsFilterBar
              filter={filter}
              onChange={setFilter}
              stationOptions={stationOptions}
              resultCount={filteredTransactions.length}
              actions={
                <>
                  <SegmentedControl
                    label={t('wallet.viewLabel')}
                    uppercase={false}
                    options={[
                      { value: 'flat', label: t('wallet.viewFlat') },
                      { value: 'station', label: t('wallet.viewByStation') },
                    ]}
                    value={filter.view}
                    onChange={(view) => setFilter({ ...filter, view })}
                  />
                  {filter.view === 'station' && (
                    <StationSortMenu
                      value={filter.stationsBy}
                      onChange={(stationsBy) => setFilter({ ...filter, stationsBy })}
                    />
                  )}
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
                </>
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
              <div className="overflow-x-auto edge-fade-end">
                <DataTable
                  {...transactionsExport.tableProps}
                  label={t('wallet.transactionsTab')}
                  columns={shownColumns}
                  rows={filteredTransactions}
                  rowKey={transactionRowKey}
                  highlightRowKey={highlightId}
                  virtualize="auto"
                  hugColumns
                  groupBy={stationGroupBy}
                  responsive="table"
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
