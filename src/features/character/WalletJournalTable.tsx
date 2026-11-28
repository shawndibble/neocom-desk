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
import { JournalSummaryRow } from '@/features/character/JournalSummaryRow';
import { InsuranceLossHost } from '@/features/character/InsuranceLossHost';
import { IskFlowChart } from '@/features/character/IskFlowChart';
import { IskBreakdownPanel } from '@/features/character/IskBreakdownPanel';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import {
  EMPTY_WALLET_JOURNAL_FILTER,
  activeWalletJournalFilters,
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
import { formatDateOnly, formatTimeOfDay, formatTimestamp } from '@/lib/timestamp';
import {
  useVisibleWalletJournalColumns,
  WALLET_JOURNAL_COLUMN_IDS,
  WALLET_JOURNAL_PHONE_OFF_BY_DEFAULT,
  type WalletJournalColumnId,
} from './walletJournalColumns';
import { TableScroll } from '@/components/ui/TableScroll';

export interface PlayerOption {
  id: string;
  name: string;
}

export interface JournalPartyView {
  options: readonly PlayerOption[];
  nameFor: (id: number) => string;
  journal: readonly JournalRow[];
}

interface JournalFilterBarProps {
  filter: WalletJournalFilter;
  onChange: (filter: WalletJournalFilter) => void;
  refTypeOptions: string[];
  playerOptions?: readonly PlayerOption[];
  partyOptions?: readonly PlayerOption[];
  actions?: ReactNode;
  resultCount?: number;
}

const ALL_OPTION = '__all';

function JournalFilterBar({
  filter,
  onChange,
  refTypeOptions,
  playerOptions,
  partyOptions,
  actions,
  resultCount,
}: JournalFilterBarProps) {
  const { t } = useTranslation();
  const refTypeField = (
    draft: WalletJournalFilter,
    setDraft: (next: WalletJournalFilter) => void
  ) => (
    <FilterField label={t('wallet.refTypeFilterLabel')}>
      <Select
        value={draft.refType ?? ALL_OPTION}
        onValueChange={(value) =>
          setDraft({ ...draft, refType: value === ALL_OPTION ? null : value })
        }
      >
        <SelectTrigger
          aria-label={t('wallet.refTypeFilterLabel')}
          className="w-44"
          active={draft.refType !== null}
        >
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
  );
  return (
    <FilterBar
      value={filter}
      inline={refTypeField}
      onChange={onChange}
      active={activeWalletJournalFilters(filter, t, {
        players: playerOptions,
        parties: partyOptions,
      })}
      resultCount={resultCount}
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
      {(draft, setDraft, surface) => (
        <>
          {surface === 'sheet' && refTypeField(draft, setDraft)}
          {playerOptions && (
            <FilterField label={t('wallet.playerFilterLabel')}>
              <Select
                value={draft.player ?? ALL_OPTION}
                onValueChange={(value) =>
                  setDraft({ ...draft, player: value === ALL_OPTION ? null : value })
                }
              >
                <SelectTrigger
                  aria-label={t('wallet.playerFilterLabel')}
                  className="w-44"
                  active={draft.player !== null}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION}>{t('wallet.playerFilterAll')}</SelectItem>
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
                active={draft.party !== null}
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

const JOURNAL_TABLE_CARDS_REM = 62;

interface JournalTableProps {
  filter: WalletJournalFilter;
  onFilterChange: (filter: WalletJournalFilter) => void;
  refTypeOptions: string[];
  playerOptions?: readonly PlayerOption[];
  partyView?: JournalPartyView;
  filteredJournal: readonly JournalRow[];
  breakdownJournal: readonly JournalRow[];
  chartJournal: readonly JournalRow[];
  journalColumns: DataTableColumn<JournalRow>[];
  label: string;
  highlightRowKey?: string | number | null;
  keyByCharacter?: boolean;
  sort: DataTableSort;
  onSortChange: (sort: DataTableSort) => void;
  tableExport: UseTableExport<JournalRow>;
  panel: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    scopeLabel: string;
    coverage?: JournalCoverage;
  };
}

const journalRowKey = (entry: JournalRow) => entry.id;
const characterRowKey = (entry: JournalRow) => `${entry.characterId}:${entry.id}`;

function rangeLabel(
  filter: WalletJournalFilter,
  rows: readonly JournalRow[],
  t: TFunction,
  timeZone: 'UTC' | undefined
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
    : t('wallet.journalRangeSince', { since: formatDateOnly(new Date(first), timeZone) });
}

const CARD_SORT_COLUMNS = new Set(['date', 'amount', 'refType']);

const OPEN_DAYS = 3;

const ALWAYS_SHOWN_COLUMNS = new Set(['refType', 'character', 'player']);

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
  const cards = isPhone || tableNarrow;
  const timeZone = useTimeZone();
  const totals = useMemo(() => journalRefTypeBreakdown(filteredJournal), [filteredJournal]);
  const breakdown = useMemo(() => journalRefTypeBreakdown(breakdownJournal), [breakdownJournal]);
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
  const shownColumns = useMemo(
    () =>
      journalColumns.filter(
        (column) =>
          ALWAYS_SHOWN_COLUMNS.has(column.id) ||
          (cards && column.id === 'date') ||
          isVisible(column.id as WalletJournalColumnId)
      ),
    [journalColumns, isVisible, cards]
  );
  const cardsSort = useMemo<DataTableSort>(
    () =>
      cards && !CARD_SORT_COLUMNS.has(sort.columnId)
        ? { columnId: 'date', direction: 'desc' }
        : sort,
    [cards, sort]
  );
  const grouped = isPhone && cardsSort.columnId === 'date';
  const cardColumns = useMemo(
    () =>
      shownColumns.map((column): DataTableColumn<JournalRow> => {
        const sortable = CARD_SORT_COLUMNS.has(column.id) ? {} : { sortValue: undefined };
        switch (column.id) {
          case 'date':
            return {
              ...column,
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
    () => (partyView && panel.open ? journalPartyBreakdown(partyView.journal) : undefined),
    [partyView, panel.open]
  );
  const playerNames = useMemo(
    () => new Map(playerOptions?.map((option) => [option.id, option.name])),
    [playerOptions]
  );
  const rowContextMenu = useCallback(
    (entry: JournalRow, tr: ReactElement): ReactElement => {
      if (!playerOptions) {
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
  const filterIsActive =
    activeWalletJournalFilters(filter, t).length > 0 || filter.text.trim() !== '';
  return (
    <>
      <JournalFilterBar
        filter={filter}
        onChange={onFilterChange}
        refTypeOptions={refTypeOptions}
        playerOptions={playerOptions}
        partyOptions={partyView?.options}
        resultCount={filteredJournal.length}
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
        <JournalSummaryRow
          totals={totals}
          entryCount={filteredJournal.length}
          showInternal={panel.coverage !== undefined}
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
        rangeLabel={rangeLabel(filter, filteredJournal, t, timeZone)}
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
        <TableScroll ref={tableRef}>
          <DataTable
            {...tableExport.tableProps}
            label={label}
            columns={cards ? cardColumns : shownColumns}
            rows={filteredJournal}
            rowKey={keyByCharacter ? characterRowKey : journalRowKey}
            highlightRowKey={highlightRowKey}
            sort={cardsSort}
            onSortChange={onSortChange}
            responsive={cards ? 'stack' : 'table'}
            stacked={cards}
            stackLayout="dense"
            groupBy={groupBy}
            virtualize="auto"
            {...(playerOptions || partyView
              ? {
                  className: 'dt-actions-pinned-only',
                  rowContextMenu,
                  rowMoreActions: true,
                }
              : {})}
          />
        </TableScroll>
      )}
      <InsuranceLossHost />
    </>
  );
}
