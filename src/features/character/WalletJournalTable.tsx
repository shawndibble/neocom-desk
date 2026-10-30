/**
 * The wallet journal table, shared by `/wallet` (the Character's journal) and
 * `/corp/wallet` (one corporation division's). ESI returns the same schema for
 * both journals, so they are literally the same filter bar, columns and table —
 * and one column-visibility store, so hiding a column on one hides it on the
 * other.
 */
import { formatIsoDay } from '@/lib/formatDateTick';
import { useCallback, useMemo, type ReactElement, type ReactNode } from 'react';
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
  MenuItem,
  MultiSelect,
  RowActionsMenu,
  SearchInput,
  DataTableSortPicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type DataTableColumn,
  type DataTableGroupBy,
  type DataTableSort,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { UseTableExport } from '@/components/ui/useTableExport';
import { journalRefKey, type JournalCoverage, type JournalRow } from '@/engine/journalNetting';
import { CharacterRowMenu } from '@/features/corp/corpRowMenus';
import { ActiveFilterRow } from '@/features/character/ActiveFilterRow';
import { InsuranceLossHost } from '@/features/character/InsuranceLossHost';
import { IskFlowChart } from '@/features/character/IskFlowChart';
import { IskBreakdownPanel } from '@/features/character/IskBreakdownPanel';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import {
  EMPTY_WALLET_JOURNAL_FILTER,
  activeWalletJournalFilterCount,
  journalNet,
  journalPartyBreakdown,
  journalRefTypeBreakdown,
  toggleBreakdownParty,
  toggleBreakdownRefType,
  type WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import { netToneClass } from '@/features/character/format';
import {
  journalDayKey,
  journalDayLabel,
  newestJournalDays,
} from '@/features/character/walletJournalDays';
import { signedIsk } from '@/lib/signedIsk';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useElementNarrowerThan } from '@/lib/useElementNarrowerThan';
import { useIsPhone } from '@/lib/useIsPhone';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimeOfDay, formatTimestamp } from '@/lib/timestamp';
import {
  useVisibleWalletJournalColumns,
  WALLET_JOURNAL_COLUMN_IDS,
  WALLET_JOURNAL_PHONE_OFF_BY_DEFAULT,
  type WalletJournalColumnId,
} from './walletJournalColumns';

/** A character id (as the filter holds it) and the name the dropdown shows. */
export interface PlayerOption {
  id: string;
  name: string;
}

/** The personal journal's Journal Parties: the Party select, the By party list and the row menu. */
export interface JournalPartyView {
  options: readonly PlayerOption[];
  nameFor: (id: number) => string;
  /** The journal under every filter but the party: the By party list keeps every party. */
  journal: readonly JournalRow[];
}

interface JournalFilterBarProps {
  filter: WalletJournalFilter;
  onChange: (filter: WalletJournalFilter) => void;
  refTypeOptions: string[];
  /** The corp journal's players, by name; absent on the personal journal, which has no Player filter. */
  playerOptions?: readonly PlayerOption[];
  /** The personal journal's parties, by name; absent on the corp journal. */
  partyOptions?: readonly PlayerOption[];
  /** The column picker, inline between the search box and the funnel. */
  actions?: ReactNode;
}

/**
 * "Any ref type" / "Any player" sentinel. Prefixed so it cannot collide with a real ESI
 * `ref_type`, which is what fills the rest of the list; Radix needs some value
 * here, and the empty string reads to it as "nothing selected".
 */
const ALL_OPTION = '__all';

/** The ref-type / date-range / text filter row above a journal table (issue #413). */
function JournalFilterBar({
  filter,
  onChange,
  refTypeOptions,
  playerOptions,
  partyOptions,
  actions,
}: JournalFilterBarProps) {
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
              value={draft.refType ?? ALL_OPTION}
              onValueChange={(value) =>
                setDraft({ ...draft, refType: value === ALL_OPTION ? null : value })
              }
            >
              <SelectTrigger aria-label={t('wallet.refTypeFilterLabel')} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>{t('wallet.refTypeFilterAll')}</SelectItem>
                {refTypeOptions.map((refType) => (
                  <SelectItem key={refType} value={refType}>
                    {journalRefLabel(refType, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          {playerOptions && (
            <FilterField label={t('wallet.playerFilterLabel')}>
              <Select
                value={draft.player ?? ALL_OPTION}
                onValueChange={(value) =>
                  setDraft({ ...draft, player: value === ALL_OPTION ? null : value })
                }
              >
                <SelectTrigger aria-label={t('wallet.playerFilterLabel')} className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION}>{t('wallet.playerFilterAll')}</SelectItem>
                  {/* A deep-linked id with no line in this division still needs an option to show. */}
                  {[
                    ...playerOptions,
                    ...(draft.player !== null && !playerOptions.some((p) => p.id === draft.player)
                      ? [{ id: draft.player, name: `#${draft.player}` }]
                      : []),
                  ].map((player) => (
                    <SelectItem key={player.id} value={player.id}>
                      {player.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          )}
          {partyOptions && (
            <FilterField label={t('wallet.partyFilterLabel')}>
              <MultiSelect
                label={t('wallet.partyFilterLabel')}
                triggerLabel={
                  draft.party === null
                    ? t('wallet.partyFilterAll')
                    : (partyOptions.find((p) => p.id === draft.party)?.name ?? `#${draft.party}`)
                }
                triggerAriaLabel={t('wallet.partyFilterLabel')}
                className="w-44"
                options={partyOptions.map((p) => ({ id: p.id, label: p.name }))}
                selected={new Set(draft.party === null ? [] : [draft.party])}
                onToggle={(id) => setDraft({ ...draft, party: draft.party === id ? null : id })}
                searchPlaceholder={t('wallet.partySearchPlaceholder')}
                noResultsLabel={t('wallet.partyNoResults')}
              />
            </FilterField>
          )}
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

/**
 * Width (rem) of the journal's own container below which its columns no longer
 * fit and the rows become cards (ADR 0017). Measured in Chrome with every
 * default column shown.
 */
const JOURNAL_TABLE_CARDS_REM = 43;

interface JournalTableProps {
  filter: WalletJournalFilter;
  onFilterChange: (filter: WalletJournalFilter) => void;
  refTypeOptions: string[];
  /** Set on the corp journal: adds the Player filter. */
  playerOptions?: readonly PlayerOption[];
  /** Set on the personal journal: adds the Party filter, the By party list and the row menu. */
  partyView?: JournalPartyView;
  filteredJournal: readonly JournalRow[];
  /** The journal under the date range and text filters only, for the panel's ref-type list. */
  breakdownJournal: readonly JournalRow[];
  /** The journal under the ref-type and text filters only: the chart sets its own date axis. */
  chartJournal: readonly JournalRow[];
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
  };
}

/** Module-level so the table's windowing and row memo see one stable function. */
const journalRowKey = (entry: JournalRow) => entry.id;
const characterRowKey = (entry: JournalRow) => `${entry.characterId}:${entry.id}`;

/** The panel's date range in words: with none set, the span the journal really holds. */
function rangeLabel(
  filter: WalletJournalFilter,
  rows: readonly JournalRow[],
  t: TFunction
): string {
  const from = filter.startDate && formatIsoDay(filter.startDate);
  const to = filter.endDate && formatIsoDay(filter.endDate);
  if (from && to) return from === to ? from : t('wallet.journalRangeBetween', { from, to });
  if (from) return t('wallet.journalRangeFrom', { from });
  if (to) return t('wallet.journalRangeTo', { to });
  const first = rows.reduce<string | null>(
    (min, entry) => (min === null || entry.date < min ? entry.date : min),
    null
  );
  return first === null
    ? t('wallet.journalRangeAll')
    : t('wallet.journalRangeSince', { since: formatIsoDay(first.slice(0, 10)) });
}

/**
 * The columns the phone sort picker offers: Date, Amount and Type. The owner
 * ruled out Description and Character sorts, and Balance is off by default.
 */
const CARD_SORT_COLUMNS = new Set(['date', 'amount', 'refType']);

/** Days a phone journal starts unfolded, newest first. */
const OPEN_DAYS = 3;

/** Columns that are not in the picker's catalog and so are never hidden by it. */
const ALWAYS_SHOWN_COLUMNS = new Set(['refType', 'character', 'player']);

/** The filter bar plus its result — either the table or a filtered-empty message. Shared by the personal and corp journal panels (issue #413). */
export function JournalTable({
  filter,
  onFilterChange,
  refTypeOptions,
  playerOptions,
  partyView,
  filteredJournal,
  breakdownJournal,
  chartJournal,
  journalColumns,
  label,
  highlightRowKey = null,
  keyByCharacter = false,
  sort,
  onSortChange,
  tableExport,
  panel,
}: JournalTableProps) {
  const { t, i18n } = useTranslation();
  const isPhone = useIsPhone();
  const [tableRef, [tableNarrow = false]] = useElementNarrowerThan<HTMLDivElement>([
    JOURNAL_TABLE_CARDS_REM,
  ]);
  // The phone list, and the table beside the open panel when its columns no longer fit.
  const cards = isPhone || tableNarrow;
  const timeZone = useTimeZone();
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
          ALWAYS_SHOWN_COLUMNS.has(column.id) ||
          // Cards print the time on the Date column and sort by it, so it can't be hidden.
          (cards && column.id === 'date') ||
          isVisible(column.id as WalletJournalColumnId)
      ),
    [journalColumns, isVisible, cards]
  );
  // A URL sort on a column the cards don't offer would leave the picker blank.
  const cardsSort = useMemo<DataTableSort>(
    () =>
      cards && !CARD_SORT_COLUMNS.has(sort.columnId)
        ? { columnId: 'date', direction: 'desc' }
        : sort,
    [cards, sort]
  );
  // Phone only; the beside-the-panel cards stay flat. Day headers only under the
  // Date sort: under Amount or Type a day's rows would be scattered.
  const grouped = isPhone && cardsSort.columnId === 'date';
  const cardColumns = useMemo(
    () =>
      shownColumns.map((column): DataTableColumn<JournalRow> => {
        const sortable = CARD_SORT_COLUMNS.has(column.id) ? {} : { sortValue: undefined };
        switch (column.id) {
          case 'date':
            return {
              ...column,
              // Under a day header only the time, in UTC like the day (see timeFormat.ts);
              // a flat list needs the date and follows the time-format preference.
              render: (entry) =>
                grouped
                  ? formatTimeOfDay(new Date(entry.date), 'UTC')
                  : formatTimestamp(new Date(entry.date), timeZone),
            };
          case 'description':
            return {
              ...column,
              ...sortable,
              primary: true,
              className: 'whitespace-normal [overflow-wrap:anywhere]',
            };
          case 'amount':
            return {
              ...column,
              cardCorner: true,
              render: (entry) =>
                entry.amount !== undefined ? signedIsk(entry.amount, 0) : t('common.unknown'),
            };
          case 'balance':
            return {
              ...column,
              ...sortable,
              stackAffix: { before: `${t('wallet.balanceCol')} ` },
            };
          default:
            return { ...column, ...sortable };
        }
      }),
    [shownColumns, grouped, timeZone, t]
  );
  // Folded groups mount nothing and grouping turns windowing off, so a year of
  // archive opens only its newest days (and the day a ?highlight link points at).
  const openDays = useMemo(() => {
    const days = new Set(newestJournalDays(filteredJournal, OPEN_DAYS));
    if (highlightRowKey !== null) {
      const key = keyByCharacter ? characterRowKey : journalRowKey;
      const target = filteredJournal.find((entry) => key(entry) === highlightRowKey);
      const day = target ? journalDayKey(target) : null;
      if (day) days.add(day);
    }
    return days;
  }, [filteredJournal, highlightRowKey, keyByCharacter]);
  const groupBy = useMemo<DataTableGroupBy<JournalRow> | undefined>(
    () =>
      grouped
        ? {
            key: journalDayKey,
            minSize: 1,
            defaultExpanded: (rows) => openDays.has(journalDayKey(rows[0] as JournalRow) ?? ''),
            renderHeader: (rows) => {
              const net = journalNet(rows);
              // DataTable never renders a header for a null key.
              const day = journalDayKey(rows[0] as JournalRow) as string;
              return (
                <span className="flex w-full items-baseline justify-between gap-4 tabular-nums">
                  <span>
                    {t('wallet.journalDayHeader', { day: journalDayLabel(day, i18n.language) })}
                  </span>
                  <span className={netToneClass(net)}>{signedIsk(net, 0)}</span>
                </span>
              );
            },
          }
        : undefined,
    [grouped, openDays, t, i18n.language]
  );
  const partyRows = useMemo(
    () => (partyView ? journalPartyBreakdown(partyView.journal) : undefined),
    [partyView]
  );
  // Corp journal only: a line with a Player offers that player's filter and actions,
  // and its ref type's filter; a line with none has one action, so no menu.
  const playerNames = useMemo(
    () => new Map(playerOptions?.map((option) => [option.id, option.name])),
    [playerOptions]
  );
  const rowContextMenu = useCallback(
    (entry: JournalRow, tr: ReactElement): ReactElement => {
      if (!playerOptions) {
        // Personal journal: a line with a Journal Party offers that party's filter and its
        // ref type's; a line with none has one action, so no menu.
        if (!partyView || entry.partyId === undefined) return tr;
        const partyId = entry.partyId;
        return (
          <RowActionsMenu
            name={partyView.nameFor(partyId)}
            items={
              <>
                <MenuItem onSelect={() => onFilterChange({ ...filter, party: String(partyId) })}>
                  {t('wallet.filterToParty', { party: partyView.nameFor(partyId) })}
                </MenuItem>
                <MenuItem
                  onSelect={() => onFilterChange({ ...filter, refType: journalRefKey(entry) })}
                >
                  {t('wallet.filterToType')}
                </MenuItem>
              </>
            }
          >
            {tr}
          </RowActionsMenu>
        );
      }
      if (entry.playerId === undefined) return tr;
      const playerId = entry.playerId;
      const name = playerNames.get(String(playerId)) ?? null;
      return (
        <CharacterRowMenu
          characterId={playerId}
          name={name}
          extraItems={
            <>
              <MenuItem onSelect={() => onFilterChange({ ...filter, player: String(playerId) })}>
                {t('wallet.filterToPlayer')}
              </MenuItem>
              <MenuItem
                onSelect={() => onFilterChange({ ...filter, refType: journalRefKey(entry) })}
              >
                {t('wallet.filterToType')}
              </MenuItem>
            </>
          }
        >
          {tr}
        </CharacterRowMenu>
      );
    },
    [playerOptions, partyView, playerNames, filter, onFilterChange, t]
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
        playerOptions={playerOptions}
        partyOptions={partyView?.options}
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
          partyNameFor={partyView?.nameFor}
          // Phone: the sort is an icon at the row's end, so the table has no sort bar.
          sortControl={
            isPhone && filteredJournal.length > 0 ? (
              <DataTableSortPicker
                iconOnly
                columns={cards ? cardColumns : shownColumns}
                rows={filteredJournal}
                sort={cardsSort}
                onSortChange={onSortChange}
              />
            ) : undefined
          }
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
        rangeLabel={rangeLabel(filter, filteredJournal, t)}
        totals={totals}
        breakdown={breakdown}
        selectedRefType={filter.refType}
        onSelectRefType={(refType) => onFilterChange(toggleBreakdownRefType(filter, refType))}
        parties={
          partyView && partyRows
            ? {
                rows: partyRows,
                nameFor: partyView.nameFor,
                selected: filter.party,
                onSelect: (partyId) => onFilterChange(toggleBreakdownParty(filter, partyId)),
              }
            : undefined
        }
        coverage={panel.coverage}
        chart={<IskFlowChart rows={chartJournal} filter={filter} onFilterChange={onFilterChange} />}
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
        <div ref={tableRef} className="overflow-x-auto">
          <DataTable
            {...tableExport.tableProps}
            label={label}
            columns={cards ? cardColumns : shownColumns}
            rows={filteredJournal}
            rowKey={keyByCharacter ? characterRowKey : journalRowKey}
            highlightRowKey={highlightRowKey}
            sort={cardsSort}
            onSortChange={onSortChange}
            // A wide table on a desktop. On a phone, and beside the open panel where
            // the table is narrower than its columns, two-line cards grouped by day.
            responsive={cards ? 'stack' : 'table'}
            stacked={cards}
            stackLayout="dense"
            groupBy={groupBy}
            // Every page of the journal, uncapped: thousands of rows for an
            // active trader.
            virtualize="auto"
            // The row menu (filters, and the corp player's actions); the
            // pinned ⋮ keeps a dense card's first line at the title's height.
            {...(playerOptions || partyView
              ? {
                  className: 'dt-actions-pinned-only',
                  rowContextMenu,
                  rowMoreActions: true,
                }
              : {})}
          />
        </div>
      )}
      <InsuranceLossHost />
    </>
  );
}
