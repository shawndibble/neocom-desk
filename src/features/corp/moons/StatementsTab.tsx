import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ColumnPickerMenu,
  DataTable,
  InfoTooltip,
  Panel,
  type DataTableColumn,
} from '@/components/ui';
import { isIssuedPeriod, periodRows, type PeriodRow } from '@/engine/corpTaxBook/bookView';
import { wholeIsk } from '@/engine/corpTaxBook/wholeIsk';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useBook } from './useBook';
import { caretColumn } from './caretColumn';
import { DueWord } from './moonsParts';
import { statementPeriodPath } from './moonsPaths';
import { isk, periodLabel, shortDate } from './moonsFormat';
import {
  STATEMENTS_COLUMN_IDS,
  useVisibleStatementsColumns,
  type StatementsColumnId,
} from './moonsColumns';
import { StatementRun } from './StatementRun';
import { useCards } from './sectionHelpers';

/** Period statuses in the order the Status column sorts them: what needs a move first, then what is done. */
const STATUS_RANK: Record<PeriodRow['status'], number> = {
  overdue: 0,
  ready: 1,
  issued: 2,
  sent: 3,
  open: 4,
  rollover: 5,
  paid: 6,
  closed: 7,
};

export function StatementsTab() {
  const { t } = useTranslation();
  const { view } = useBook();
  const navigate = useNavigate();
  const [tableRef, cards] = useCards();
  const rows = useMemo(() => periodRows(view), [view]);
  // Under 1 ISK left over is nothing to report (#5247).
  const tolerance = [...view.internals.byMiner.values()]
    .flatMap((m) => m.allocation.writeOffs)
    .filter((w) => wholeIsk(w.amount) >= 1);
  const late = [...view.internals.byMiner.values()].flatMap((m) => m.draft.writtenOff);

  const columnVisibility = useColumnVisibility(useVisibleStatementsColumns, STATEMENTS_COLUMN_IDS);

  const allColumns: DataTableColumn<PeriodRow>[] = [
    {
      id: 'period',
      header: t('corpTaxBook.moons.cols.period'),
      primary: true,
      render: (r) => <span className="font-semibold">{periodLabel(r.start, r.end)}</span>,
      sortValue: (r) => r.start,
      sortFirst: 'desc',
    },
    {
      id: 'status',
      header: t('corpTaxBook.moons.cols.status'),
      render: (r) => (
        <span
          className={
            r.status === 'ready'
              ? 'text-xs font-semibold text-warning uppercase'
              : r.status === 'overdue'
                ? 'text-xs font-semibold text-danger uppercase'
                : r.status === 'paid'
                  ? 'text-xs font-semibold text-success uppercase'
                  : 'text-xs text-text-dim uppercase'
          }
        >
          {t(`corpTaxBook.moons.periodStatus.${r.status}`)}
        </span>
      ),
      sortValue: (r) => STATUS_RANK[r.status],
      sortFirst: 'asc',
    },
    {
      id: 'miners',
      header: t('corpTaxBook.moons.cols.miners'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => r.miners,
      sortValue: (r) => r.miners,
    },
    {
      id: 'billed',
      header: t('corpTaxBook.moons.cols.billed'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => (r.billed ? isk(r.billed) : '—'),
      sortValue: (r) => r.billed,
    },
    {
      id: 'paid',
      header: t('corpTaxBook.moons.cols.paid'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => (r.paid ? isk(r.paid) : '—'),
      sortValue: (r) => r.paid,
    },
    {
      id: 'outstanding',
      header: t('corpTaxBook.moons.cols.outstanding'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (r) => (r.outstanding ? isk(r.outstanding) : '—'),
      sortValue: (r) => r.outstanding,
    },
    {
      id: 'mailed',
      header: t('corpTaxBook.moons.cols.mailed'),
      headerTooltip: t('corpTaxBook.moons.periods.mailedTip'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) =>
        r.statements ? (
          <span className={r.mailed < r.statements ? 'font-semibold text-warning' : undefined}>
            {t('corpTaxBook.moons.periods.mailedOf', { sent: r.mailed, total: r.statements })}
          </span>
        ) : (
          '—'
        ),
      // The share of Statements mailed, least first: the periods with mail still to send lead.
      sortValue: (r) => (r.statements ? r.mailed / r.statements : undefined),
      sortFirst: 'asc',
    },
    {
      id: 'due',
      header: t('corpTaxBook.moons.cols.due'),
      render: (r) => <DueWord dueAt={r.dueAt} now={view.input.now} pausedUntil={r.pausedUntil} />,
      sortValue: (r) => r.dueAt ?? undefined,
      sortFirst: 'asc',
    },
    {
      id: 'issued',
      header: t('corpTaxBook.moons.cols.issued'),
      render: (r) => (r.issuedAt ? shortDate(r.issuedAt) : '—'),
      sortValue: (r) => r.issuedAt ?? undefined,
      sortFirst: 'desc',
    },
  ];
  const columnsById = Object.fromEntries(allColumns.map((c) => [c.id, c])) as Record<
    StatementsColumnId,
    DataTableColumn<PeriodRow>
  >;
  const columns = [
    ...allColumns.filter(
      (c) => c.id === 'period' || columnVisibility.isVisible(c.id as StatementsColumnId)
    ),
    // Only an issued period has Statements to open; the rest carry no caret (hidden = no caret).
    ...(cards ? [] : [caretColumn<PeriodRow>((r) => !isIssuedPeriod(r))]),
  ];

  return (
    <div className="space-y-4">
      <StatementRun />
      <Panel
        title={t('corpTaxBook.moons.periods.title')}
        meta={
          <span className="text-xs text-text-dim">
            {t('corpTaxBook.moons.periods.meta', {
              cadence: t(`corpTaxBook.moons.settings.cadence.${view.input.cadence.kind}`),
              minimum: isk(view.input.minimumStatement),
            })}
          </span>
        }
        padded={false}
        actions={
          <ColumnPickerMenu
            available={STATEMENTS_COLUMN_IDS}
            visible={columnVisibility.visible}
            columnsById={columnsById}
            onToggle={columnVisibility.toggle}
            onReset={columnVisibility.reset}
            buttonLabel={t('common.columnsButton')}
            menuTitle={t('common.columnsMenuTitle')}
            resetLabel={t('common.resetColumns')}
            size="sm"
          />
        }
      >
        <div ref={tableRef} className="@container overflow-x-auto">
          <DataTable
            label={t('corpTaxBook.moons.periods.title')}
            columns={columns}
            rows={rows}
            rowKey={(r) => r.start}
            onRowClick={(r) => navigate(statementPeriodPath(r.start))}
            rowClickable={isIssuedPeriod}
            density="compact"
            stacked={cards}
            stackColumns={2}
            mobileSort
          />
        </div>
        {(tolerance.length > 0 || late.length > 0) && (
          <div className="flex items-start gap-2 border-t border-line px-3 py-2 text-xs text-text-dim">
            <div className="space-y-0.5">
              {tolerance.length > 0 && (
                <p>
                  {t('corpTaxBook.moons.periods.writeOffsTolerance', {
                    tolerance: isk(tolerance.reduce((s, w) => s + wholeIsk(w.amount), 0)),
                    count: tolerance.length,
                  })}
                </p>
              )}
              {late.length > 0 && (
                <p>{t('corpTaxBook.moons.periods.writeOffsLate', { count: late.length })}</p>
              )}
            </div>
            <InfoTooltip
              label={t('corpTaxBook.moons.periods.writeOffsLabel')}
              content={t('corpTaxBook.moons.periods.writeOffsTip')}
              glyph="info"
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
