import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  clearFilters,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  Panel,
  SearchInput,
  StatChip,
  StatChips,
  sortRows,
  useOpenAfterMenu,
  type ActiveFilter,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import {
  minerDetail,
  type BookView,
  type MinerRow,
  type MinerStanding,
} from '@/engine/corpTaxBook/bookView';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useIsPhone } from '@/lib/useIsPhone';
import { boolParam, textParam } from '@/lib/urlState';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { useBook } from './useBook';
import { useTabsProjection } from './useTabsProjection';
import { isk, shortDate } from './moonsFormat';
import {
  MINERS_COLUMN_IDS,
  MINERS_CARDS_BELOW_REM,
  MINERS_NARROW_OFF,
  MINERS_PHONE_OFF,
  useVisibleMinersColumns,
  type MinersColumnId,
} from './moonsColumns';
import { OverdueWord, StandingWord } from './moonsParts';
import { MinerExpandedRow } from './MinerExpandedRow';
import { MinerRowMenu } from './MinerRowMenu';
import { useCards } from './sectionHelpers';
import { MarkNotTaxDialog, ReasonDialog, RecordPaymentDialog } from './BookDialogs';

const PARAMS = {
  q: textParam(),
  members: boolParam(true),
  guests: boolParam(true),
};

/** A Miner is listed while it owes, is owed, or has days waiting; the rest are only counted. */
const isActive = (m: MinerRow) => m.owed > 0 || m.unbilled > 0 || m.pending > 0 || m.credit > 0;

/** Standings in the order the Standing column sorts them. */
const STANDING_RANK: readonly MinerStanding[] = ['member', 'guest', 'left'];

const DEFAULT_SORT: DataTableSort = { columnId: 'overdue', direction: 'desc' };

/** What the funnel edits: which standings the table lists. Search sits in the row, outside it. */
interface MinersFilter {
  members: boolean;
  guests: boolean;
}

const OPEN_MINER_KEY = 'corpTaxBook.minersTab.openMiner.';

/** Keeps the open row across Open page then Back; sessionStorage, best-effort. */
function readOpenMiner(corporationId: number): string | null {
  try {
    return sessionStorage.getItem(OPEN_MINER_KEY + corporationId);
  } catch {
    return null;
  }
}

function writeOpenMiner(corporationId: number, id: string | null) {
  try {
    if (id === null) sessionStorage.removeItem(OPEN_MINER_KEY + corporationId);
    else sessionStorage.setItem(OPEN_MINER_KEY + corporationId, id);
  } catch {
    // Blocked storage: the row just closes after a visit elsewhere.
  }
}

export function MinersTab() {
  const { t } = useTranslation();
  const { view, names, edit, canEdit, corporationId } = useBook();
  const { miners, totals, donationsBeforeBook } = useTabsProjection();
  const [dialog, setDialog] = useState<
    | { kind: 'record' | 'dismiss'; miner: MinerRow }
    | { kind: 'notTax'; miner: MinerRow; paymentId: string }
    | null
  >(null);
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const [tableRef, cards, compact] = useCards(MINERS_CARDS_BELOW_REM);
  const phone = useIsPhone();
  // Read once; a stored miner the list no longer holds opens nothing and is cleared on mount.
  const [openMiner] = useState(() => {
    const id = readOpenMiner(corporationId);
    return id !== null && miners.some((m) => m.id === id) ? id : null;
  });
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
  const nameOf = (m: MinerRow) => names.character(m.mainCharacterId);

  const counts = useMemo(
    () => ({
      members: miners.filter((m) => m.standing !== 'guest' && isActive(m)).length,
      guests: miners.filter((m) => m.standing === 'guest' && isActive(m)).length,
    }),
    [miners]
  );
  const rows = useMemo(() => {
    const q = params.q.trim().toLowerCase();
    return miners.filter((m) => {
      const inGroup = m.standing === 'guest' ? params.guests : params.members;
      if (!inGroup || !isActive(m)) return false;
      if (!q) return true;
      return [nameOf(m), ...m.characterIds.map(names.character)].some((n) =>
        n.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` identity changes as names resolve
  }, [miners, params, names]);
  // What the Non-members chip being off keeps out of the table.
  const hiddenGuests = params.guests
    ? []
    : miners.filter((m) => m.standing === 'guest' && isActive(m));
  const hiddenGuestOwed = hiddenGuests.reduce((sum, m) => sum + m.owed, 0);
  const hidden = miners.length - miners.filter(isActive).length;

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
      // Members first, then guests, then those who left: the order the standing chips list them.
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
      render: (m) => <OverdueWord days={m.overdueDays} paused={m.paused} />,
      sortValue: (m) => m.overdueDays ?? -1,
    },
    {
      id: 'unbilled',
      header: t('corpTaxBook.moons.cols.unbilled'),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => (m.unbilled ? isk(m.unbilled) : '—'),
      sortValue: (m) => m.unbilled,
    },
    {
      id: 'credit',
      header: t('corpTaxBook.moons.cols.credit'),
      align: 'right',
      className: 'tabular-nums',
      // isk() rounds: a sub-ISK remainder is no credit, not a green 0.
      render: (m) =>
        Math.round(m.credit) > 0 ? <span className="text-isk-pos">{isk(m.credit)}</span> : '—',
      sortValue: (m) => m.credit,
    },
    {
      id: 'paid',
      header: t('corpTaxBook.moons.cols.lastPaid'),
      render: (m) => (m.lastPaidAt ? shortDate(m.lastPaidAt) : '—'),
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
  // In the URL (ADR 0015) as `?sort=`, validated against every column, so a sort on a hidden one
  // survives. The table can only sort by a column it shows: while the sorted one is unticked, sort
  // the rows here.
  const { sort, onSortChange } = useUrlSort(
    'sort',
    DEFAULT_SORT,
    allColumns.map((c) => c.id)
  );
  const hiddenSortColumn = columns.some((c) => c.id === sort.columnId)
    ? undefined
    : allColumns.find((c) => c.id === sort.columnId);
  const sortedRows = hiddenSortColumn ? sortRows(rows, hiddenSortColumn, sort.direction) : rows;

  const filter: MinersFilter = { members: params.members, guests: params.guests };
  const standingLabel = t('corpTaxBook.moons.cols.inCorp');
  const active: ActiveFilter<MinersFilter>[] =
    filter.members && filter.guests
      ? []
      : [
          {
            label: standingLabel,
            value:
              [
                filter.members && t('corpTaxBook.moons.miners.members'),
                filter.guests && t('corpTaxBook.moons.miners.nonMembers'),
              ]
                .filter(Boolean)
                .join(', ') || t('common.checkboxSelect.none'),
            clear: (value) => ({ ...value, members: true, guests: true }),
          },
        ];

  return (
    <div className="space-y-4">
      <StatChips>
        <StatChip label={t('corpTaxBook.moons.chips.owed')} value={isk(totals.owed)} emphasis />
        <StatChip
          label={t('corpTaxBook.moons.chips.overdue')}
          value={t('corpTaxBook.moons.chips.overdueValue', {
            amount: isk(totals.overdue),
            count: totals.overdueCount,
          })}
          {...(totals.overdue > 0 ? { tone: 'danger' as const } : {})}
        />
        <StatChip label={t('corpTaxBook.moons.chips.unbilled')} value={isk(totals.unbilled)} />
        <StatChip label={t('corpTaxBook.moons.chips.credit')} value={isk(totals.credit)} />
      </StatChips>
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
          <div ref={tableRef} className="@container overflow-x-auto">
            <DataTable
              label={t('corpTaxBook.moons.tabs.miners')}
              columns={columns}
              rows={sortedRows}
              rowKey={(m) => m.id}
              expandableRow={{
                renderDetail: (m) => <MinerExpandedRow miner={m} />,
                leadingIcon: true,
                initialKey: openMiner,
                onExpandedChange: (key) =>
                  writeOpenMiner(corporationId, key === null ? null : String(key)),
              }}
              stacked={cards}
              rowClassName={() => 'group'}
              rowContextMenu={rowContextMenu}
              rowMoreActions={canEdit}
              sort={hiddenSortColumn ? null : sort}
              onSortChange={onSortChange}
              mobileSort
              stackSummary={t('corpTaxBook.moons.miners.summary', {
                shown: rows.length,
                total: miners.length,
              })}
            />
          </div>
        )}
        {hiddenGuests.length > 0 && (
          <p className="border-t border-line px-3 py-2 text-xs text-text-dim">
            {t('corpTaxBook.moons.miners.nonMembersHidden', {
              count: hiddenGuests.length,
              amount: isk(hiddenGuestOwed),
            })}
          </p>
        )}
        {hidden > 0 && (
          <p className="border-t border-line px-3 py-2 text-xs text-text-dim">
            {t('corpTaxBook.moons.miners.hidden', { count: hidden })}
          </p>
        )}
      </Panel>
      {dialog?.kind === 'record' && (
        <RecordPaymentDialog
          open
          onClose={() => setDialog(null)}
          miner={dialog.miner}
          minerName={names.character(dialog.miner.mainCharacterId)}
          defaultAmount={dialog.miner.owed}
          statementId={openStatementId(view, dialog.miner.id)}
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
            amount: isk(dialog.miner.owed + dialog.miner.unbilled),
          })}
          run={async (reason) => {
            await edit({
              action: 'dismiss',
              scope: 'miner',
              targetId: dialog.miner.id,
              reason,
              amountIsk: dialog.miner.owed + dialog.miner.unbilled,
            });
          }}
        />
      )}
    </div>
  );
}

/** The Statement a payment recorded from the Miners table settles: the Miner's first unsettled one. */
function openStatementId(view: BookView, minerId: string): string | undefined {
  return minerDetail(view, minerId)?.statements.find(
    (s) => !view.internals.byMiner.get(minerId)?.allocation.byStatement.get(s.id)?.settled
  )?.id;
}
