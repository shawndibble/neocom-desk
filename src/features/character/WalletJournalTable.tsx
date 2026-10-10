/**
 * The wallet journal table, shared by `/wallet` (the Character's journal) and
 * `/corp/wallet` (one corporation division's). ESI returns the same schema for
 * both journals, so they are literally the same filter bar, columns and table —
 * and one column-visibility store, so hiding a column on one hides it on the
 * other.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Button,
  CollapsiblePanel,
  ColumnPickerMenu,
  DataTable,
  DateRangeFields,
  EmptyState,
  FilterBar,
  FilterField,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { humanizeRefType, iskToneClass } from '@/features/character/format';
import { useJournalBreakdownPref } from '@/features/character/journalBreakdownPref';
import {
  EMPTY_WALLET_JOURNAL_FILTER,
  activeWalletJournalFilterCount,
  journalNetTotal,
  journalRefTypeBreakdown,
  toggleBreakdownRefType,
  type RefTypeBreakdownRow,
  type WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import { signedIsk } from '@/features/market/signedIsk';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { clampIskZero, formatIsk } from '@/lib/isk';
import { useIsNarrow } from '@/lib/useIsNarrow';
import {
  useVisibleWalletJournalColumns,
  WALLET_JOURNAL_COLUMN_IDS,
  WALLET_JOURNAL_PHONE_OFF_BY_DEFAULT,
  type WalletJournalColumnId,
} from './walletJournalColumns';

interface JournalFilterBarProps {
  filter: WalletJournalFilter;
  onChange: (filter: WalletJournalFilter) => void;
  refTypeOptions: string[];
  /** The column picker, inline between the search box and the funnel. */
  actions?: ReactNode;
}

/**
 * "Any ref type" sentinel. Prefixed so it cannot collide with a real ESI
 * `ref_type`, which is what fills the rest of the list; Radix needs some value
 * here, and the empty string reads to it as "nothing selected".
 */
const ALL_REF_TYPES = '__all';

/** Whole-ISK ledger figure, with an explicit `+` on gains (the wallet reconciles against the game client). */
function formatIskSigned(value: number): string {
  const text = formatIsk(value);
  return value > 0 && !text.startsWith('-') ? `+${text}` : text;
}

/** The ref-type / date-range / text filter row above a journal table (issue #413). */
function JournalFilterBar({ filter, onChange, refTypeOptions, actions }: JournalFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeWalletJournalFilterCount(filter)}
      triggerLabel
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('wallet.journalSearchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
      actions={actions}
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('wallet.refTypeFilterLabel')}>
            <Select
              value={draft.refType ?? ALL_REF_TYPES}
              onValueChange={(value) =>
                setDraft({ ...draft, refType: value === ALL_REF_TYPES ? null : value })
              }
            >
              <SelectTrigger aria-label={t('wallet.refTypeFilterLabel')} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REF_TYPES}>{t('wallet.refTypeFilterAll')}</SelectItem>
                {refTypeOptions.map((refType) => (
                  <SelectItem key={refType} value={refType}>
                    {humanizeRefType(refType)}
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

interface JournalTableProps {
  filter: WalletJournalFilter;
  onFilterChange: (filter: WalletJournalFilter) => void;
  refTypeOptions: string[];
  filteredJournal: readonly WalletJournalEntry[];
  /** The journal under the date range and text filters only, for the ref-type breakdown. */
  breakdownJournal: readonly WalletJournalEntry[];
  journalColumns: DataTableColumn<WalletJournalEntry>[];
  label: string;
  /**
   * The journal line a wallet alert pointed at. Passed by `/wallet` only —
   * `walletBalanceChanged` is a character event, and the corp journal has its
   * own rows with their own ids.
   */
  highlightRowKey?: number | null;
  sort: DataTableSort;
  onSortChange: (sort: DataTableSort) => void;
  /** The export the panel's title-bar export button drives, so row menus export the same rows. */
  tableExport: UseTableExport<WalletJournalEntry>;
}

/** Module-level so the table's windowing and row memo see one stable function. */
const journalRowKey = (entry: WalletJournalEntry) => entry.id;

/** The filter bar plus its result — either the table or a filtered-empty message. Shared by the personal and corp journal panels (issue #413). */
export function JournalTable({
  filter,
  onFilterChange,
  refTypeOptions,
  filteredJournal,
  breakdownJournal,
  journalColumns,
  label,
  highlightRowKey = null,
  sort,
  onSortChange,
  tableExport,
}: JournalTableProps) {
  const { t } = useTranslation();
  const breakdown = useMemo(() => journalRefTypeBreakdown(breakdownJournal), [breakdownJournal]);
  // Open on desktop, folded on a phone where the headline alone answers the
  // question — until the pilot toggles it, then their choice sticks.
  const isNarrow = useIsNarrow();
  const storedBreakdownOpen = useJournalBreakdownPref((state) => state.value);
  const breakdownPrefHydrated = useJournalBreakdownPref((state) => state.hydrated);
  const hydrateBreakdownOpen = useJournalBreakdownPref((state) => state.hydrate);
  const setStoredBreakdownOpen = useJournalBreakdownPref((state) => state.setValue);
  useEffect(() => {
    void hydrateBreakdownOpen();
  }, [hydrateBreakdownOpen]);
  const breakdownOpen = storedBreakdownOpen ?? !isNarrow;
  const breakdownColumns = useMemo<DataTableColumn<RefTypeBreakdownRow>[]>(
    () => [
      {
        id: 'refType',
        header: t('wallet.journalBreakdownRefType'),
        render: (row) => humanizeRefType(row.refType),
        sortValue: (row) => row.refType,
      },
      {
        id: 'net',
        header: t('wallet.journalBreakdownNet'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (row) => (clampIskZero(row.net, 0) === 0 ? '' : iskToneClass(row.net)),
        render: (row) => (
          <>
            {formatIskSigned(row.net)}
            {row.income > 0 && row.expense > 0 && (
              <span className="block text-xs font-normal text-text-dim">
                {t('wallet.journalBreakdownBothSides', {
                  in: formatIsk(row.income),
                  out: formatIsk(row.expense),
                })}
              </span>
            )}
          </>
        ),
        sortValue: (row) => row.net,
      },
    ],
    [t]
  );
  const breakdownHeadline = (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
      <span>
        {t('wallet.journalBreakdownIn')}{' '}
        <span className="text-isk-pos">{formatIsk(breakdown.totalIn)}</span>
      </span>
      <span>
        {t('wallet.journalBreakdownOut')}{' '}
        <span className="text-isk-neg">{formatIsk(breakdown.totalOut)}</span>
      </span>
      <span>
        {t('wallet.journalBreakdownNet')}{' '}
        <span className={clampIskZero(breakdown.net, 0) === 0 ? '' : iskToneClass(breakdown.net)}>
          {formatIskSigned(breakdown.net)}
        </span>
      </span>
    </span>
  );
  const filteredNet = useMemo(() => journalNetTotal(filteredJournal), [filteredJournal]);
  // One store for both journals, so hiding a column on one hides it on the other.
  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleWalletJournalColumns,
    WALLET_JOURNAL_COLUMN_IDS,
    WALLET_JOURNAL_PHONE_OFF_BY_DEFAULT
  );
  const columnsById = useMemo(
    () =>
      Object.fromEntries(journalColumns.map((column) => [column.id, column])) as Record<
        WalletJournalColumnId,
        DataTableColumn<WalletJournalEntry>
      >,
    [journalColumns]
  );
  // Filtered here, not where the columns are built: the route's `useUrlSort`
  // validates `?journal.sort=` against the full id list, so a sort on a hidden
  // column survives until the column comes back.
  const shownColumns = useMemo(
    () =>
      journalColumns.filter(
        (column) => column.id === 'refType' || isVisible(column.id as WalletJournalColumnId)
      ),
    [journalColumns, isVisible]
  );
  // A filter with no criteria active still runs (it's the identity filter), so
  // "is a filter active" is asked separately here rather than read off the result.
  const filterIsActive = activeWalletJournalFilterCount(filter) > 0 || filter.text.trim() !== '';
  return (
    <>
      <JournalFilterBar
        filter={filter}
        onChange={onFilterChange}
        refTypeOptions={refTypeOptions}
        actions={
          <ColumnPickerMenu
            available={WALLET_JOURNAL_COLUMN_IDS}
            visible={visible}
            columnsById={columnsById}
            showLabel
            onToggle={toggle}
            onReset={reset}
            buttonLabel={t('common.columnsButton')}
            menuTitle={t('common.columnsMenuTitle')}
            resetLabel={t('common.resetColumns')}
          />
        }
      />
      {/* Held back until the stored choice has loaded, so a pilot who folded it never sees it flash open. */}
      {breakdown.rows.length > 0 && breakdownPrefHydrated && (
        <CollapsiblePanel
          title={t('wallet.journalBreakdownTitle')}
          expanded={breakdownOpen}
          onToggle={() => void setStoredBreakdownOpen(!breakdownOpen)}
          labels={{
            show: t('wallet.journalBreakdownShow'),
            hide: t('wallet.journalBreakdownHide'),
          }}
          padded={false}
          collapsedSummary={<div className="px-3 py-2">{breakdownHeadline}</div>}
        >
          <div className="px-3 py-2">{breakdownHeadline}</div>
          <DataTable
            label={t('wallet.journalBreakdownTitle')}
            columns={breakdownColumns}
            rows={breakdown.rows}
            rowKey={(row) => row.refType}
            selectedRowKey={filter.refType}
            onRowClick={(row) => onFilterChange(toggleBreakdownRefType(filter, row.refType))}
            responsive="table"
          />
        </CollapsiblePanel>
      )}
      {filterIsActive && filteredJournal.length > 0 && (
        <p className="border-b border-line px-3 py-2 text-xs text-text-dim">
          <Trans
            i18nKey="wallet.journalFilteredSummary"
            count={filteredJournal.length}
            values={{ net: signedIsk(filteredNet, 0) }}
            components={{
              net: (
                <span
                  className={`tabular-nums ${
                    clampIskZero(filteredNet, 0) === 0 ? '' : iskToneClass(filteredNet)
                  }`}
                />
              ),
            }}
          />
        </p>
      )}
      {filteredJournal.length === 0 ? (
        <EmptyState
          title={t('wallet.journalNoFilterMatches')}
          hint={t('wallet.journalNoFilterMatchesHint')}
          className="py-8"
          action={
            filterIsActive ? (
              <Button size="sm" onClick={() => onFilterChange(EMPTY_WALLET_JOURNAL_FILTER)}>
                {t('common.resetFilters')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            {...tableExport.tableProps}
            label={label}
            columns={shownColumns}
            rows={filteredJournal}
            rowKey={journalRowKey}
            highlightRowKey={highlightRowKey}
            sort={sort}
            onSortChange={onSortChange}
            // A ledger read across columns: a plain table on a phone, scrolling
            // sideways (DESIGN.md §6c Restraint).
            responsive="table"
            // Every page of the journal, uncapped: thousands of rows for an
            // active trader.
            virtualize="auto"
          />
        </div>
      )}
    </>
  );
}
