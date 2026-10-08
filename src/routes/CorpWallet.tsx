/**
 * `/corp/wallet` — the corporation's wallet, one division at a time: its
 * balance, its journal and its market transactions (issues #298, #570).
 *
 * This used to be the Corporation side of a Personal / Corporation switch on
 * `/wallet` (round 38). It moved here so `/wallet` is only ever the pilot's
 * own ISK, and the corporation's money sits in the Corp section beside
 * everything else the corporation owns — see `docs/context/decisions/` for the
 * decision reversing round 38 for Wallet.
 *
 * Gated like `/corp/members`: `useCorpRouteGate` with `canReadWallet`, so an
 * Accountant sees it and a Director with no wallet role does not, and the
 * `CorpSubNav` entry is hidden by the same capability.
 *
 * No tab bar of its own: the Corp sub-nav is the one level of tabs, so the
 * page is a strip of every division's balance (clicking one selects it) above
 * one table, switched between Journal and Transactions by a
 * `SegmentedControl` (`?view=`). Both reads load for the selected division
 * either way — the journal's market lines name their item from the fills — so
 * switching the view never re-pages anything (issue #413).
 *
 * The journal is the same table `/wallet` draws (`WalletJournalTable.tsx`) —
 * ESI returns the same schema for both.
 */
import {
  focusRingInsetClassName,
  interactiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { useMemo, useState } from 'react';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import {
  CollapsiblePanel,
  DataAgeBadge,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  SegmentedControl,
  Spinner,
  Tooltip,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type {
  CorporationDivisions,
  CorporationWalletDivision,
  CorporationWalletTransaction,
  WalletJournalEntry,
} from '@/esi/endpoints';
import { iskToneClass } from '@/features/character/format';
import { journalTransactionLinks } from '@/features/character/journalTransactionLink';
import { loadTypeNames } from '@/features/character/typeNames';
import { walletJournalCsvColumns } from '@/features/character/walletJournalCsv';
import {
  EMPTY_JOURNAL_FILTER_PARAMS,
  JOURNAL_FIELD_TO_PARAM,
  JOURNAL_FILTER_PARAMS,
  type WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import {
  JOURNAL_SORT,
  JOURNAL_SORT_COLUMN_IDS,
  typeNameLookup,
  useJournalColumnsBuilder,
  useJournalFilterResult,
} from '@/features/character/walletJournal';
import { JournalTable } from '@/features/character/WalletJournalTable';
import {
  EMPTY_TRANSACTION_FILTER_PARAMS,
  filterWalletTransactions,
  TRANSACTION_FIELD_TO_PARAM,
  TRANSACTION_FILTER_PARAMS,
  type WalletTransactionFilter,
} from '@/features/character/walletTransactionFilter';
import { CorpDenied } from '@/features/corp/CorpDenied';
import { CorpSubNav } from '@/features/corp/CorpSubNav';
import { CorpTransactionsPanel } from '@/features/corp/CorpTransactionsPanel';
import { walletDivisions, type WalletDivision } from '@/features/corp/divisions';
import { useActiveCorporationIdState } from '@/features/corp/owner';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import {
  loadCorporationDivisions,
  loadCorporationWalletJournal,
  loadCorporationWalletTransactions,
  loadCorporationWallets,
} from '@/features/corp/wallet';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { formatIsk } from '@/lib/isk';
import { enumParam, intParam } from '@/lib/urlState';
import { useIsPhone } from '@/lib/useIsPhone';
import { useUrlFilter, useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { useActiveCharacter } from '@/stores/activeCharacter';

/** `?division=` (issue #419, #1302). ESI divisions are 1-7. */
const DIVISION_PARAM = intParam(1, { min: 1, max: 7 });

/** Which table the page shows for the selected division. */
type WalletTable = 'journal' | 'transactions';
const VIEW_PARAM = enumParam<WalletTable>(['journal', 'transactions'], 'journal');

const TRANSACTIONS_SORT = { columnId: 'date', direction: 'desc' } as const;

/** Stable identities, so a missing read doesn't invalidate its dependent memos every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const EMPTY_JOURNAL: readonly WalletJournalEntry[] = [];
const EMPTY_TRANSACTIONS: readonly CorporationWalletTransaction[] = [];

/** Balances and the division names, which need two separate reads and two separate scopes. */
interface CorpBalancesSnapshot {
  walletsResult: StatusResult<CorporationWalletDivision[]>;
  divisionsResult: StatusResult<CorporationDivisions>;
}

async function loadCorpBalances(
  characterId: number,
  corporationId: number
): Promise<CorpBalancesSnapshot> {
  const [walletsResult, divisionsResult] = await Promise.all([
    loadCorporationWallets(characterId, corporationId),
    loadCorporationDivisions(characterId, corporationId),
  ]);
  return { walletsResult, divisionsResult };
}

/**
 * One division's fills, plus the names for the item ids in them.
 *
 * Resolved here rather than in the panel because it is a network read: the
 * table's item column and the filter's own text match both spell a `type_id`
 * through the same `nameFor`, so an unresolved id reads as `Type #99999` in
 * both places instead of quietly dropping out of a search.
 */
interface CorpTransactionsSnapshot {
  transactionsResult: StatusResult<CorporationWalletTransaction[]>;
  typeNames: Map<number, string>;
}

async function loadCorpTransactions(
  characterId: number,
  corporationId: number,
  division: number
): Promise<CorpTransactionsSnapshot> {
  const transactionsResult = await loadCorporationWalletTransactions(
    characterId,
    corporationId,
    division
  );
  const typeIds = [...new Set((transactionsResult.cached?.data ?? []).map((txn) => txn.type_id))];
  const typeNames = await loadTypeNames(typeIds);
  return { transactionsResult, typeNames };
}

interface CorpDivisionsPanelProps {
  balances: CorpBalancesSnapshot | null;
  loading: boolean;
  divisions: readonly WalletDivision[];
  selected: number;
  onSelect: (division: number) => void;
  divisionLabel: (entry: WalletDivision) => string;
  offlineTitleKey: string;
}

/**
 * Every division's balance at once, each a button that selects the division
 * the table below reads — the division picker and the balance in one.
 */
function CorpDivisionsPanel({
  balances,
  loading,
  divisions,
  selected,
  onSelect,
  divisionLabel,
  offlineTitleKey,
}: CorpDivisionsPanelProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [expanded, setExpanded] = useState(false);
  const walletsResult = balances?.walletsResult.cached ?? null;
  const selectedEntry = divisions.find((entry) => entry.division === selected) ?? divisions[0];
  // Seven full-width cards push the journal below the fold on a phone: fold to
  // the selected division there. Loading, empty and one-division panels have
  // nothing worth folding.
  const foldable = isPhone && !loading && !!walletsResult && divisions.length > 1;
  const offlineNote = walletsResult?.fromCache ? (
    <p className="mt-3 text-[0.6875rem] text-warning uppercase">{t(offlineTitleKey)}</p>
  ) : null;
  return (
    <CollapsiblePanel
      title={t('corp.wallet.divisionsTitle')}
      actions={walletsResult ? <DataAgeBadge date={walletsResult.fetchedAt} /> : undefined}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      collapsible={foldable}
      labels={{ show: t('corp.wallet.divisionsShow'), hide: t('corp.wallet.divisionsHide') }}
      collapsedSummary={
        selectedEntry ? (
          <>
            <p className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {divisionLabel(selectedEntry)}
              </span>
              <span
                className={`shrink-0 text-lg font-medium tabular-nums ${iskToneClass(selectedEntry.balance)}`}
              >
                {formatIsk(selectedEntry.balance, 2)}
              </span>
            </p>
            {offlineNote}
          </>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : !walletsResult || divisions.length === 0 ? (
        <EmptyState title={t('wallet.corpBalanceEmpty')} className="py-4" />
      ) : (
        <>
          <div
            role="group"
            aria-label={t('wallet.corpDivisionLabel')}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          >
            {divisions.map((entry) => {
              const isSelected = entry.division === selected;
              return (
                <button
                  key={entry.division}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    onSelect(entry.division);
                    setExpanded(false);
                  }}
                  className={cx(
                    'min-h-11 rounded-xs border border-line px-3 py-2 text-left',
                    interactiveClassName,
                    focusRingInsetClassName,
                    isSelected ? selectedRowClassName : 'hover:bg-panel-2 active:bg-panel'
                  )}
                >
                  <Tooltip content={divisionLabel(entry)}>
                    <span className="block truncate text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                      {divisionLabel(entry)}
                    </span>
                  </Tooltip>
                  <span
                    className={`block text-lg font-medium tabular-nums ${iskToneClass(entry.balance)}`}
                  >
                    {formatIsk(entry.balance, 2)}
                  </span>
                </button>
              );
            })}
          </div>
          {offlineNote}
        </>
      )}
    </CollapsiblePanel>
  );
}

interface CorpJournalPanelProps {
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  journal: readonly WalletJournalEntry[];
  loading: boolean;
  journalColumns: DataTableColumn<WalletJournalEntry>[];
  filter: WalletJournalFilter;
  rowsFilter: WalletJournalFilter;
  onFilterChange: (filter: WalletJournalFilter) => void;
  sort: DataTableSort;
  onSortChange: (sort: DataTableSort) => void;
  divisionQualifier: string | undefined;
  offlineTitleKey: string;
}

function CorpJournalPanel({
  journalResult,
  journal,
  loading,
  journalColumns,
  filter,
  rowsFilter,
  onFilterChange,
  sort,
  onSortChange,
  divisionQualifier,
  offlineTitleKey,
}: CorpJournalPanelProps) {
  const { t } = useTranslation();
  const { filteredJournal, breakdownJournal, refTypeOptions } = useJournalFilterResult(
    journal,
    rowsFilter
  );
  const journalCsvColumns = useMemo(() => walletJournalCsvColumns(t), [t]);
  // Named after the division, so exporting two divisions never overwrites the
  // same file (issue #413).
  const journalExport = useTableExport({
    surface: 'corp-wallet-journal',
    rows: filteredJournal,
    columns: journalCsvColumns,
    truncated: journalResult?.truncated ?? false,
    qualifier: divisionQualifier,
  });

  return (
    <Panel
      padded={false}
      title={t('wallet.journalTab')}
      actions={
        journalResult ? (
          <span className="flex items-center gap-2">
            <TableActionsMenu name={t('wallet.journalTab')} tableExport={journalExport} />
            <DataAgeBadge date={journalResult.fetchedAt} />
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : journalResult === null ? (
        // No cache and the read didn't come back — offline, or a 403 the role
        // gate swallowed (CONTEXT.md's `/corp/assets` split, same axis here).
        <EmptyState
          title={t('common.loadFailedTitle')}
          hint={t('common.loadFailedHint')}
          className="py-8"
        />
      ) : journal.length === 0 ? (
        <EmptyState
          title={t('wallet.corpJournalEmptyTitle')}
          hint={t('wallet.corpJournalEmptyHint')}
          className="py-8"
        />
      ) : (
        <>
          {journalResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t(offlineTitleKey)}
            </p>
          )}
          {journalResult.truncated && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')} — {t('wallet.journalTruncatedHint')}
            </p>
          )}
          <JournalTable
            filter={filter}
            onFilterChange={onFilterChange}
            refTypeOptions={refTypeOptions}
            filteredJournal={filteredJournal}
            breakdownJournal={breakdownJournal}
            journalColumns={journalColumns}
            label={t('wallet.journalTab')}
            sort={sort}
            onSortChange={onSortChange}
            tableExport={journalExport}
          />
        </>
      )}
    </Panel>
  );
}

/** Mounted only once the gate is `ready` — see `useCorpRouteGate`. */
function CorpWalletView() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  // `undefined` while Dexie is still answering — every panel spins through
  // that, rather than flashing its "nothing cached" state for one render.
  const corporationIdState = useActiveCorporationIdState();
  const corporationId = corporationIdState ?? null;
  const corpPending = corporationIdState === undefined;
  const [view, setView] = useUrlParam('view', VIEW_PARAM);

  // Corp Transactions' item context menu (issue #817) — same Quickbar/Item
  // Detail plumbing as every other item table.
  const itemActions = usePageItemActions({ activeCharacterId });

  // Null until both are known: a corporation id is learned only from the
  // public-info read, so on a cold device there is briefly nothing to read.
  const corpKey =
    activeCharacterId !== null && corporationId !== null
      ? `${activeCharacterId}:${corporationId}`
      : null;

  // The key carries the corporation, so a corp change resets rather than
  // relabelling its rows.
  const corpBalances = useCorpSnapshot<CorpBalancesSnapshot | null>(
    corpKey,
    async () =>
      activeCharacterId === null || corporationId === null
        ? null
        : loadCorpBalances(activeCharacterId, corporationId),
    { name: 'corp-wallet:balances', characterId: activeCharacterId }
  );

  const divisions = useMemo<WalletDivision[]>(
    () =>
      walletDivisions(
        corpBalances.data?.walletsResult.cached?.data ?? [],
        corpBalances.data?.divisionsResult.cached?.data ?? null
      ),
    [corpBalances.data]
  );

  // Derived, not effect-synced: falls back to the first division whenever the
  // chosen one isn't in this corporation's list — which is exactly what a corp
  // change looks like, and also what a `?division=` deep link (issue #419)
  // naming a division this corporation doesn't have looks like.
  const [division, setDivision] = useUrlParam('division', DIVISION_PARAM);
  const effectiveDivision = divisions.some((entry) => entry.division === division)
    ? division
    : (divisions[0]?.division ?? division);
  const selectedDivision = divisions.find((entry) => entry.division === effectiveDivision) ?? null;

  // Its own key, division included: ESI publishes no all-divisions journal and
  // each division caches separately (features/corp/wallet.ts). A division or
  // corporation change resets it.
  const divisionKey = corpKey !== null ? `${corpKey}:${effectiveDivision}` : null;
  const corpJournal = useCorpSnapshot<StatusResult<WalletJournalEntry[]> | null>(
    divisionKey,
    async () =>
      activeCharacterId === null || corporationId === null
        ? null
        : loadCorporationWalletJournal(activeCharacterId, corporationId, effectiveDivision),
    { name: 'corp-wallet:journal', characterId: activeCharacterId }
  );

  // Loaded for both views: Transactions draws it, and the journal's market
  // lines name their item from these same fills.
  const corpTransactions = useCorpSnapshot<CorpTransactionsSnapshot | null>(
    divisionKey,
    async () =>
      activeCharacterId === null || corporationId === null
        ? null
        : loadCorpTransactions(activeCharacterId, corporationId, effectiveDivision),
    { name: 'corp-wallet:transactions', characterId: activeCharacterId }
  );

  const divisionLabel = (entry: WalletDivision) =>
    entry.name ?? t('wallet.corpDivisionFallback', { division: entry.division });
  const divisionQualifier = selectedDivision ? divisionLabel(selectedDivision) : undefined;

  /** One Refresh button for every read on the page. */
  const handleRefresh = () => {
    corpBalances.refresh();
    corpJournal.refresh();
    corpTransactions.refresh();
  };

  const corpTransactionsResult = corpTransactions.data?.transactionsResult.cached ?? null;
  const corpTransactionRows = corpTransactionsResult?.data ?? EMPTY_TRANSACTIONS;
  const corpTypeNames = corpTransactions.data?.typeNames ?? NO_NAMES;
  // The one spelling of an item id on this page: the table's column, the CSV
  // and the search all go through it, so what is drawn is what is searched.
  const nameForType = useMemo(() => typeNameLookup(corpTypeNames), [corpTypeNames]);
  const linkFor = useMemo(
    () => journalTransactionLinks(corpTransactionRows),
    [corpTransactionRows]
  );
  const buildJournalColumns = useJournalColumnsBuilder();
  const journalColumns = useMemo(
    () => buildJournalColumns(linkFor, nameForType),
    [buildJournalColumns, linkFor, nameForType]
  );

  const corpJournalResult = corpJournal.data?.cached ?? null;
  const corpJournalEntries = corpJournalResult?.data ?? EMPTY_JOURNAL;

  // Keyed on the raw `?division=` param, not `effectiveDivision`: the division
  // list resolves async, so a cold reload of a filtered deep link would
  // otherwise see the scope change as it resolves and wipe the very filter the
  // URL just delivered. Reset on a real division switch — the rows change
  // wholesale, and the ref-type dropdown is built from that journal's values.
  const filterScope = `division:${division}`;
  const [journalFilter, setJournalFilter, journalRowsFilter] = useUrlFilter<WalletJournalFilter>(
    filterScope,
    JOURNAL_FILTER_PARAMS,
    JOURNAL_FIELD_TO_PARAM,
    EMPTY_JOURNAL_FILTER_PARAMS
  );
  const journalSortProps = useUrlSort('journal.sort', JOURNAL_SORT, JOURNAL_SORT_COLUMN_IDS);

  const [transactionFilter, setTransactionFilter, transactionRowsFilter] =
    useUrlFilter<WalletTransactionFilter>(
      filterScope,
      TRANSACTION_FILTER_PARAMS,
      TRANSACTION_FIELD_TO_PARAM,
      EMPTY_TRANSACTION_FILTER_PARAMS
    );
  const filteredTransactions = useMemo(
    () => filterWalletTransactions(corpTransactionRows, transactionRowsFilter, nameForType),
    [corpTransactionRows, transactionRowsFilter, nameForType]
  );
  const transactionsSortProps = useUrlSort('txn.sort', TRANSACTIONS_SORT, [
    'date',
    'item',
    'side',
    'quantity',
    'unitPrice',
    'total',
  ]);

  return (
    <ItemActionsProvider page={itemActions}>
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader
          title={t('corp.wallet.title')}
          subNav={<CorpSubNav flush />}
          actions={
            <IconButton
              icon={<Icon.Refresh />}
              label={t('wallet.refresh')}
              onClick={handleRefresh}
              disabled={corpBalances.loading || corpJournal.loading || corpTransactions.loading}
            />
          }
        />

        <CorpDivisionsPanel
          balances={corpBalances.data}
          loading={corpPending || (corpBalances.loading && corpBalances.data === null)}
          divisions={divisions}
          selected={effectiveDivision}
          onSelect={setDivision}
          divisionLabel={divisionLabel}
          offlineTitleKey={
            corpBalances.refreshCount > 0 ? 'common.refreshFailedTitle' : 'common.offlineTitle'
          }
        />

        {/* A view switch, not a second tab bar: the Corp sub-nav is the one level of tabs. */}
        <SegmentedControl
          label={t('corp.wallet.viewLabel')}
          size="sm"
          options={[
            { value: 'journal', label: t('wallet.journalTab') },
            { value: 'transactions', label: t('corp.wallet.transactionsView') },
          ]}
          value={view}
          onChange={setView}
        />

        {view === 'journal' ? (
          <CorpJournalPanel
            journalResult={corpJournalResult}
            journal={corpJournalEntries}
            loading={corpPending || (corpJournal.loading && corpJournal.data === null)}
            journalColumns={journalColumns}
            filter={journalFilter}
            rowsFilter={journalRowsFilter}
            onFilterChange={setJournalFilter}
            sort={journalSortProps.sort}
            onSortChange={journalSortProps.onSortChange}
            divisionQualifier={divisionQualifier}
            offlineTitleKey={
              corpJournal.refreshCount > 0 ? 'common.refreshFailedTitle' : 'common.offlineTitle'
            }
          />
        ) : (
          <CorpTransactionsPanel
            transactionsResult={corpTransactionsResult}
            transactions={corpTransactionRows}
            filteredTransactions={filteredTransactions}
            loading={corpPending || (corpTransactions.loading && corpTransactions.data === null)}
            filter={transactionFilter}
            onFilterChange={setTransactionFilter}
            sort={transactionsSortProps.sort}
            onSortChange={transactionsSortProps.onSortChange}
            nameFor={nameForType}
            divisionQualifier={divisionQualifier}
            offlineTitleKey={
              corpTransactions.refreshCount > 0
                ? 'common.refreshFailedTitle'
                : 'common.offlineTitle'
            }
          />
        )}
      </div>
    </ItemActionsProvider>
  );
}

export function CorpWallet() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canReadWallet);

  if (gate.status === 'loading') return <Spinner />;

  if (gate.status === 'denied') {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader title={t('corp.wallet.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('corp.wallet.noAccessTitle')}
          hint={t('corp.wallet.noAccessHint')}
        />
      </div>
    );
  }

  return <CorpWalletView />;
}
