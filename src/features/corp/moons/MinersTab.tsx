import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  clearFilters,
  Disclosure,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  Panel,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  sortRows,
  summarizeFilterValues,
  useOpenAfterMenu,
  type ActiveFilter,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import type { MinerRow, MinerStanding } from '@/engine/corpTaxBook/bookView';
import {
  MINER_BALANCES,
  matchesMinerBalance,
  type MinerBalance,
} from '@/engine/corpTaxBook/overdueAging';
import { rowInteractiveClassName } from '@/components/ui/controlStyles';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useIsPhone } from '@/lib/useIsPhone';
import { boolParam, optionalEnumParam, textParam } from '@/lib/urlState';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { useBook } from './useBook';
import { BookTotals } from './BookTotals';
import { atDate, isk } from './moonsFormat';
import {
  MINERS_COLUMN_IDS,
  MINERS_CARDS_BELOW_REM,
  MINERS_NARROW_OFF,
  MINERS_PHONE_OFF,
  useVisibleMinersColumns,
  type MinersColumnId,
} from './moonsColumns';
import { OverdueWord, StandingWord } from './moonsParts';
import { minerPath } from './moonsPaths';
import { MinerRowMenu } from './MinerRowMenu';
import { useCards } from './sectionHelpers';
import { MarkNotTaxDialog, ReasonDialog, RecordPaymentDialog } from './BookDialogs';
import { AccountStatus } from './AccountStatus';
import { accountSortValue } from '@/engine/corpTaxBook/bookSections';
import { TableScroll } from '@/components/ui/TableScroll';

const PARAMS = {
  q: textParam(),
  members: boolParam(true),
  guests: boolParam(true),
  balance: optionalEnumParam(MINER_BALANCES),
};

const ANY_BALANCE = 'any';

const STANDING_RANK: readonly MinerStanding[] = ['member', 'guest', 'left'];

const DEFAULT_SORT: DataTableSort = { columnId: 'overdue', direction: 'desc' };

interface MinersFilter {
  members: boolean;
  guests: boolean;
  balance: MinerBalance | null;
}

export function MinersTab() {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { view, names, edit, canEdit } = useBook();
  const { miners, donationsBeforeBook } = view;
  const [dialog, setDialog] = useState<
    | { kind: 'record' | 'dismiss'; miner: MinerRow }
    | { kind: 'notTax'; miner: MinerRow; paymentId: string }
    | null
  >(null);
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const [tableRef, cards, compact] = useCards(MINERS_CARDS_BELOW_REM);
  const phone = useIsPhone();
  const navigate = useNavigate();
  const rowContextMenu = useCallback(
    (m: MinerRow, tr: ReactElement) => (
      <MinerRowMenu
        miner={m}
        onRecord={(miner) => run(() => setDialog({ kind: 'record', miner }))}
        onDismiss={(miner) => run(() => setDialog({ kind: 'dismiss', miner }))}
        onNotTax={(miner, paymentId) => run(() => setDialog({ kind: 'notTax', miner, paymentId }))}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {tr}
      </MinerRowMenu>
    ),
    [run, onCloseAutoFocus]
  );
  const [params, setParams] = useUrlParams(PARAMS);
  const [closedOpen, setClosedOpen] = useState(false);
  const nameOf = (m: MinerRow) => names.character(m.mainCharacterId);

  const closedAtById = useMemo(
    () => new Map(view.input.miners.flatMap((m) => (m.closedAt ? [[m.id, m.closedAt]] : []))),
    [view.input.miners]
  );
  const openMiners = useMemo(
    () => miners.filter((m) => !closedAtById.has(m.id)),
    [miners, closedAtById]
  );
  const closed = useMemo(
    () => miners.filter((m) => closedAtById.has(m.id)),
    [miners, closedAtById]
  );

  const counts = useMemo(
    () => ({
      members: openMiners.filter((m) => m.standing !== 'guest').length,
      guests: openMiners.filter((m) => m.standing === 'guest').length,
    }),
    [openMiners]
  );
  const rows = useMemo(() => {
    const q = params.q.trim().toLowerCase();
    return openMiners.filter((m) => {
      const inGroup = m.standing === 'guest' ? params.guests : params.members;
      if (!inGroup) return false;
      if (params.balance && !matchesMinerBalance(m, params.balance)) return false;
      if (!q) return true;
      return [nameOf(m), ...m.characterIds.map(names.character)].some((n) =>
        n.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` identity changes as names resolve
  }, [openMiners, params, names]);
  const hiddenGuests = params.guests ? [] : openMiners.filter((m) => m.standing === 'guest');
  const hiddenGuestOwed = hiddenGuests.reduce((sum, m) => sum + m.owed, 0);

  const columnVisibility = useColumnVisibility(
    useVisibleMinersColumns,
    MINERS_COLUMN_IDS,
    phone ? MINERS_PHONE_OFF : MINERS_NARROW_OFF,
    compact
  );
  const allColumns: DataTableColumn<MinerRow>[] = [
    {
      id: 'miner',
      header: t('corpTaxBook.moons.cols.miner'),
      primary: true,
      render: (m) => (
        <span className="block min-w-0">
          <span className="font-semibold">{nameOf(m)}</span>
          {m.characterIds.length > 1 && (
            <span className="block text-xs text-text-dim">
              {t('corpTaxBook.moons.moreCharacters', { count: m.characterIds.length - 1 })}
            </span>
          )}
        </span>
      ),
      sortValue: (m) => nameOf(m),
    },
    {
      id: 'standing',
      header: t('corpTaxBook.moons.cols.inCorp'),
      render: (m) => <StandingWord standing={m.standing} />,
      sortValue: (m) => STANDING_RANK.indexOf(m.standing),
      sortFirst: 'asc',
    },
    {
      id: 'owed',
      header: t('corpTaxBook.moons.cols.owed'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (m) => (m.owed ? isk(m.owed) : '—'),
      sortValue: (m) => m.owed,
    },
    {
      id: 'overdue',
      header: t('corpTaxBook.moons.cols.overdue'),
      render: (m) =>
        m.overdueDays === null && !m.paused ? (
          <span data-dense-omit>
            <OverdueWord days={m.overdueDays} paused={m.paused} />
          </span>
        ) : (
          <OverdueWord days={m.overdueDays} paused={m.paused} />
        ),
      sortValue: (m) => m.overdueDays ?? -1,
    },
    {
      id: 'account',
      header: t('corpTaxBook.moons.cols.account'),
      render: (m) => <AccountStatus account={view.internals.byMiner.get(m.id)?.account} />,
      sortValue: (m) => accountSortValue(view.internals.byMiner.get(m.id)?.account),
      sortFirst: 'asc',
    },
    {
      id: 'credit',
      header: t('corpTaxBook.moons.cols.credit'),
      align: 'right',
      className: 'tabular-nums',
      render: (m) =>
        Math.round(m.credit) > 0 ? <span className="text-isk-pos">{isk(m.credit)}</span> : '—',
      sortValue: (m) => m.credit,
    },
    {
      id: 'paid',
      header: t('corpTaxBook.moons.cols.lastPaid'),
      render: (m) => (m.lastPaidAt ? atDate(m.lastPaidAt, zone) : <span data-dense-omit>—</span>),
      sortValue: (m) => m.lastPaidAt ?? '',
    },
  ];
  const columnsById = Object.fromEntries(allColumns.map((c) => [c.id, c])) as Record<
    MinersColumnId,
    DataTableColumn<MinerRow>
  >;
  const columns = allColumns.filter(
    (c) => c.id === 'miner' || columnVisibility.isVisible(c.id as MinersColumnId)
  );
  const { sort, onSortChange } = useUrlSort(
    'sort',
    DEFAULT_SORT,
    allColumns.map((c) => c.id)
  );
  const hiddenSortColumn = columns.some((c) => c.id === sort.columnId)
    ? undefined
    : allColumns.find((c) => c.id === sort.columnId);
  const sortedRows = hiddenSortColumn ? sortRows(rows, hiddenSortColumn, sort.direction) : rows;

  const filter: MinersFilter = {
    members: params.members,
    guests: params.guests,
    balance: params.balance,
  };
  const standingLabel = t('corpTaxBook.moons.cols.inCorp');
  const balanceLabel = t('corpTaxBook.moons.miners.balance.label');
  const active: ActiveFilter<MinersFilter>[] = [
    ...(filter.members && filter.guests
      ? []
      : [
          {
            label: standingLabel,
            value: summarizeFilterValues(
              [
                ...(filter.members ? [t('corpTaxBook.moons.miners.members')] : []),
                ...(filter.guests ? [t('corpTaxBook.moons.miners.nonMembers')] : []),
              ],
              t
            ),
            clear: (value: MinersFilter) => ({ ...value, members: true, guests: true }),
          },
        ]),
    ...(filter.balance
      ? [
          {
            label: balanceLabel,
            value: t(`corpTaxBook.moons.miners.balance.${filter.balance}`),
            clear: (value: MinersFilter) => ({ ...value, balance: null }),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <BookTotals />
      {donationsBeforeBook > 0 && (
        <p className="text-xs text-text-dim">
          {t('corpTaxBook.moons.beforeBook.donations', { count: donationsBeforeBook })}
        </p>
      )}
      <Panel padded={false}>
        <FilterBar<MinersFilter>
          value={filter}
          onChange={(next) => setParams(next)}
          active={active}
          resultCount={rows.length}
          className="p-3"
          search={
            <SearchInput
              className="min-w-56 flex-1"
              value={params.q}
              onChange={(e) => setParams({ q: e.target.value })}
              placeholder={t('corpTaxBook.moons.miners.search')}
              aria-label={t('corpTaxBook.moons.miners.searchLabel')}
            />
          }
          actions={
            <ColumnPickerMenu
              available={MINERS_COLUMN_IDS}
              visible={columnVisibility.visible}
              columnsById={columnsById}
              onToggle={columnVisibility.toggle}
              onReset={columnVisibility.reset}
              buttonLabel={t('common.columnsButton')}
              menuTitle={t('common.columnsMenuTitle')}
              resetLabel={t('common.resetColumns')}
            />
          }
        >
          {(value, onChange) => (
            <>
              <FilterField label={standingLabel} stretch={false}>
                <div role="group" aria-label={standingLabel} className="flex flex-wrap gap-2">
                  <FilterChip
                    label={t('corpTaxBook.moons.miners.members')}
                    selected={value.members}
                    onToggle={() => onChange({ ...value, members: !value.members })}
                    count={counts.members}
                  />
                  <FilterChip
                    label={t('corpTaxBook.moons.miners.nonMembers')}
                    selected={value.guests}
                    onToggle={() => onChange({ ...value, guests: !value.guests })}
                    count={counts.guests}
                  />
                </div>
              </FilterField>
              <FilterField label={balanceLabel} stretch={false}>
                <Select
                  value={value.balance ?? ANY_BALANCE}
                  onValueChange={(next) =>
                    onChange({
                      ...value,
                      balance: next === ANY_BALANCE ? null : (next as MinerBalance),
                    })
                  }
                >
                  <SelectTrigger
                    active={value.balance !== null}
                    aria-label={balanceLabel}
                    className="w-56"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_BALANCE}>
                      {t('corpTaxBook.moons.miners.balance.any')}
                    </SelectItem>
                    {MINER_BALANCES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {t(`corpTaxBook.moons.miners.balance.${b}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </>
          )}
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState
            title={
              active.length > 0 || params.q.trim() !== ''
                ? t('corpTaxBook.moons.miners.emptyFiltered')
                : t('corpTaxBook.moons.miners.empty')
            }
            className="border-t border-line py-8"
            action={
              active.length > 0 ? (
                <Button size="sm" onClick={() => setParams(clearFilters(filter, active))}>
                  {t('common.resetFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableScroll ref={tableRef} className="@container">
            <DataTable
              label={t('corpTaxBook.moons.tabs.miners')}
              columns={columns}
              rows={sortedRows}
              rowKey={(m) => m.id}
              onRowClick={(m) => navigate(minerPath(m.id))}
              rowHref={(m) => minerPath(m.id)}
              stacked={cards}
              stackLayout="dense"
              rowClassName={() => 'group'}
              rowContextMenu={rowContextMenu}
              rowMoreActions={canEdit}
              sort={hiddenSortColumn ? null : sort}
              onSortChange={onSortChange}
              mobileSort
              stackSummary={t('corpTaxBook.moons.miners.summary', {
                shown: rows.length,
                total: openMiners.length,
              })}
            />
          </TableScroll>
        )}
        {hiddenGuests.length > 0 && (
          <p className="border-t border-line px-3 py-2 text-xs text-text-dim">
            {t('corpTaxBook.moons.miners.nonMembersHidden', {
              count: hiddenGuests.length,
              amount: isk(hiddenGuestOwed),
            })}
          </p>
        )}
      </Panel>
      {closed.length > 0 && (
        <Panel padded={false}>
          <Disclosure
            label={t('corpTaxBook.moons.miners.closedAccounts')}
            trailing={closed.length}
            expanded={closedOpen}
            onToggle={() => setClosedOpen((v) => !v)}
          >
            {closed.map((m) => (
              <Link
                key={m.id}
                to={minerPath(m.id)}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${rowInteractiveClassName}`}
              >
                <span className="min-w-0 truncate font-semibold">{nameOf(m)}</span>
                <span className="shrink-0 text-xs text-text-dim">
                  {t('corpTaxBook.moons.miners.closedOn', {
                    date: atDate(closedAtById.get(m.id)!, zone),
                  })}
                </span>
              </Link>
            ))}
          </Disclosure>
        </Panel>
      )}
      {dialog?.kind === 'record' && (
        <RecordPaymentDialog
          open
          onClose={() => setDialog(null)}
          miner={dialog.miner}
          minerName={names.character(dialog.miner.mainCharacterId)}
          defaultAmount={dialog.miner.owed}
        />
      )}
      {dialog?.kind === 'notTax' &&
        (() => {
          const payment = view.internals.byMiner
            .get(dialog.miner.id)
            ?.payments.find((p) => p.id === dialog.paymentId);
          return payment ? (
            <MarkNotTaxDialog
              open
              onClose={() => setDialog(null)}
              payment={payment}
              fromName={names.character(payment.characterId)}
            />
          ) : null;
        })()}
      {dialog?.kind === 'dismiss' && (
        <ReasonDialog
          open
          onClose={() => setDialog(null)}
          title={t('corpTaxBook.moons.dialogs.dismissMiner.title', {
            name: names.character(dialog.miner.mainCharacterId),
          })}
          intro={t('corpTaxBook.moons.dialogs.dismissMiner.intro')}
          reasonLabel={t('corpTaxBook.moons.dialogs.reasonShown')}
          confirmLabel={t('corpTaxBook.moons.dialogs.dismissConfirm', {
            amount: isk(dialog.miner.owed),
          })}
          run={async (reason) => {
            await edit({
              action: 'dismiss',
              scope: 'miner',
              targetId: dialog.miner.id,
              reason,
              amountIsk: dialog.miner.owed,
            });
          }}
        />
      )}
    </div>
  );
}
