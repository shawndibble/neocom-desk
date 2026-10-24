import { useTranslation } from 'react-i18next';
import { DataTable, InfoTooltip, Panel, type DataTableColumn } from '@/components/ui';
import { periodRows, type PeriodRow } from '@/engine/corpTaxBook/bookView';
import { useBook } from './useBook';
import { isk, periodLabel, shortDate } from './moonsFormat';
import { StatementRun } from './StatementRun';

export function StatementsTab() {
  const { t } = useTranslation();
  const { view } = useBook();
  const rows = periodRows(view);
  const tolerance = [...view.internals.byMiner.values()].flatMap((m) => m.allocation.writeOffs);
  const late = [...view.internals.byMiner.values()].flatMap((m) => m.draft.writtenOff);

  const columns: DataTableColumn<PeriodRow>[] = [
    {
      id: 'period',
      header: t('corpTaxBook.moons.cols.period'),
      primary: true,
      render: (r) => <span className="font-semibold">{periodLabel(r.start, r.end)}</span>,
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
                : 'text-xs text-text-dim uppercase'
          }
        >
          {t(`corpTaxBook.moons.periodStatus.${r.status}`)}
        </span>
      ),
    },
    {
      id: 'miners',
      header: t('corpTaxBook.moons.cols.miners'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => r.miners,
    },
    {
      id: 'billed',
      header: t('corpTaxBook.moons.cols.billed'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => (r.billed ? isk(r.billed) : '—'),
    },
    {
      id: 'paid',
      header: t('corpTaxBook.moons.cols.paid'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => (r.paid ? isk(r.paid) : '—'),
    },
    {
      id: 'outstanding',
      header: t('corpTaxBook.moons.cols.outstanding'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (r) => (r.outstanding ? isk(r.outstanding) : '—'),
    },
    {
      id: 'issued',
      header: t('corpTaxBook.moons.cols.issued'),
      render: (r) => (r.issuedAt ? shortDate(r.issuedAt) : '—'),
    },
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
      >
        <DataTable
          label={t('corpTaxBook.moons.periods.title')}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.start}
          density="compact"
          stackColumns={2}
        />
        {(tolerance.length > 0 || late.length > 0) && (
          <div className="flex items-start gap-2 border-t border-line px-3 py-2 text-xs text-text-dim">
            <div className="space-y-0.5">
              {tolerance.length > 0 && (
                <p>
                  {t('corpTaxBook.moons.periods.writeOffsTolerance', {
                    tolerance: isk(tolerance.reduce((s, w) => s + w.amount, 0)),
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
