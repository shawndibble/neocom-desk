/**
 * The wallet journal table, shared by `/wallet` (the Character's journal) and
 * `/corp/wallet` (one corporation division's). ESI returns the same schema for
 * both journals, so they are literally the same filter bar, columns and table —
 * and one column-visibility store, so hiding a column on one hides it on the
 * other.
 */
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  DateRangeFields,
  EmptyState,
  FilterBar,
  FilterField,
  IconButton,
  LiveStatus,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { JournalCoverage, JournalRow } from '@/engine/journalNetting';
import { ActiveFilterRow } from '@/features/character/ActiveFilterRow';
import { IskBreakdownPanel } from '@/features/character/IskBreakdownPanel';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import {
  EMPTY_WALLET_JOURNAL_FILTER,
  activeWalletJournalFilterCount,
  journalRefTypeBreakdown,
  toggleBreakdownRefType,
  type WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import { signedIsk } from '@/features/market/signedIsk';
import { useColumnVisibility } from '@/lib/columnVisibility';
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
                    {journalRefLabel(refType, t)}
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
  filteredJournal: readonly JournalRow[];
  /** The journal under the date range and text filters only, for the panel's ref-type list. */
  breakdownJournal: readonly JournalRow[];
  journalColumns: DataTableColumn<JournalRow>[];
  label: string;
  /**
   * The journal line a wallet alert pointed at. Passed by `/wallet` only —
   * `walletBalanceChanged` is a character event, and the corp journal has its
   * own rows with their own ids. `${characterId}:${id}` when `keyByCharacter`.
   */
  highlightRowKey?: string | number | null;
  /** Rows come from more than one Character, whose entry ids can repeat: key them per Character. */
  keyByCharacter?: boolean;
  sort: DataTableSort;
  onSortChange: (sort: DataTableSort) => void;
  /** The export the panel's title-bar export button drives, so row menus export the same rows. */
  tableExport: UseTableExport<JournalRow>;
  /**
   * "Where the ISK went": the side panel. Both journals have one; only
   * `/wallet` passes `coverage`, which turns on own-Character netting.
   */
  panel: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The scope in words: "All characters", or the corp division. */
    scopeLabel: string;
    coverage?: JournalCoverage;
    /** The daily chart (#3914) slots in here, under the In / Out / Net totals. */
    chart?: ReactNode;
  };
}

/** Module-level so the table's windowing and row memo see one stable function. */
const journalRowKey = (entry: JournalRow) => entry.id;
const characterRowKey = (entry: JournalRow) => `${entry.characterId}:${entry.id}`;

/** The panel's date range in words: the journal's own window when no range is set. */
function rangeLabel(filter: WalletJournalFilter, t: TFunction): string {
  const { startDate: from, endDate: to } = filter;
  if (from && to) return t('wallet.journalRangeBetween', { from, to });
  if (from) return t('wallet.journalRangeFrom', { from });
  if (to) return t('wallet.journalRangeTo', { to });
  return t('wallet.journalRangeDefault');
}

/** Columns that are not in the picker's catalog and so are never hidden by it. */
const ALWAYS_SHOWN_COLUMNS = new Set(['refType', 'character']);

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
  keyByCharacter = false,
  sort,
  onSortChange,
  tableExport,
  panel,
}: JournalTableProps) {
  const { t } = useTranslation();
  // Internal lines (own-Character transfers) are in neither, so the panel and the
  // Journal's In / Out / Net line can never disagree.
  const totals = useMemo(() => journalRefTypeBreakdown(filteredJournal), [filteredJournal]);
  const breakdown = useMemo(() => journalRefTypeBreakdown(breakdownJournal), [breakdownJournal]);
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
        DataTableColumn<JournalRow>
      >,
    [journalColumns]
  );
  // Filtered here, not where the columns are built: the route's `useUrlSort`
  // validates `?journal.sort=` against the full id list, so a sort on a hidden
  // column survives until the column comes back.
  const shownColumns = useMemo(
    () =>
      journalColumns.filter(
        (column) =>
          ALWAYS_SHOWN_COLUMNS.has(column.id) || isVisible(column.id as WalletJournalColumnId)
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
          <>
            <IconButton
              icon={<Icon.Orders />}
              label={t('wallet.journalBreakdownTitle')}
              visibleLabel={t('wallet.journalBreakdownTitle')}
              pressed={panel.open}
              onClick={() => panel.onOpenChange(!panel.open)}
            />
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
          </>
        }
      />
      <div className="border-b border-line px-3 py-2">
        <ActiveFilterRow
          filter={filter}
          onChange={onFilterChange}
          totals={totals}
          entryCount={filteredJournal.length}
          showInternal={panel.coverage !== undefined}
        />
      </div>
      <LiveStatus>
        {filterIsActive &&
          filteredJournal.length > 0 &&
          t('wallet.journalFilteredSummaryStatus', {
            count: filteredJournal.length,
            net: signedIsk(totals.net, 2),
          })}
      </LiveStatus>
      <IskBreakdownPanel
        open={panel.open}
        onClose={() => panel.onOpenChange(false)}
        scopeLabel={panel.scopeLabel}
        rangeLabel={rangeLabel(filter, t)}
        totals={totals}
        breakdown={breakdown}
        selectedRefType={filter.refType}
        onSelectRefType={(refType) => onFilterChange(toggleBreakdownRefType(filter, refType))}
        coverage={panel.coverage}
        chart={panel.chart}
      />
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
            rowKey={keyByCharacter ? characterRowKey : journalRowKey}
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
