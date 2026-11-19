import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  EmptyState,
  PageHeader,
  Panel,
  StatChip,
  StatChips,
  Tooltip,
  useOpenAfterMenu,
  type DataTableColumn,
} from '@/components/ui';
import {
  isIssuedPeriod,
  periodPreview,
  periodRows,
  periodStatements,
  type PeriodMinerLine,
  type PeriodStatementRow,
} from '@/engine/corpTaxBook/bookView';
import { tabPath } from '@/lib/pageTabs';
import { RecordPaymentDialog } from './BookDialogs';
import { caretColumn } from './caretColumn';
import { StatementRowMenu } from './StatementRowMenu';
import { useBook } from './useBook';
import { MOONS_TABS, minerPath } from './moonsPaths';
import { isk, periodLabel, shortDate } from './moonsFormat';
import { Crumb, DueWord } from './moonsParts';
import { useCards } from './sectionHelpers';
import { useStatementParam } from './useStatementParam';
import { StatementPanel } from './StatementPanel';

const STATEMENTS_PATH = tabPath(MOONS_TABS, 'statements');

function MailWord({ mail }: { mail: PeriodStatementRow['mail'] }) {
  const { t } = useTranslation();
  if (mail.kind === 'stopped') {
    return (
      <Tooltip content={t('corpTaxBook.moons.statementPeriod.stoppedTip', { count: mail.count })}>
        <span tabIndex={0} className="text-warning">
          {t('corpTaxBook.moons.statementPeriod.stopped')}
        </span>
      </Tooltip>
    );
  }
  if (mail.kind === 'not-mailed') {
    return <span className="text-warning">{t('corpTaxBook.moons.statementPeriod.notMailed')}</span>;
  }
  return (
    <span className="whitespace-nowrap">
      {mail.count > 1
        ? t('corpTaxBook.moons.statementPeriod.mailSentTimes', { count: mail.count })
        : t('corpTaxBook.moons.statementPeriod.mailSent')}
    </span>
  );
}

/** A period's page: an issued one lists its Statements; any other lists the Miners it will bill. */
export function StatementPeriodDetail({ periodStart }: { periodStart: string }) {
  const { view } = useBook();
  const issued = periodRows(view).some((r) => r.start === periodStart && isIssuedPeriod(r));
  return issued ? (
    <IssuedPeriodDetail periodStart={periodStart} />
  ) : (
    <PeriodPreviewDetail periodStart={periodStart} />
  );
}

/** A period with no Statements yet (open, ready, closed, rollover): each Miner's own days. */
function PeriodPreviewDetail({ periodStart }: { periodStart: string }) {
  const { t } = useTranslation();
  const { view, names } = useBook();
  const navigate = useNavigate();
  const [tableRef, cards] = useCards();
  const period = periodRows(view).find((r) => r.start === periodStart);
  const lines = periodPreview(view, periodStart);
  if (!period || !lines) {
    return (
      <div className="space-y-4">
        <Crumb to={STATEMENTS_PATH} label={t('corpTaxBook.moons.tabs.statements')} />
        <EmptyState title={t('corpTaxBook.moons.statementPeriod.notFound')} />
      </div>
    );
  }
  const nameOf = (l: PeriodMinerLine) => {
    const miner = view.miners.find((m) => m.id === l.minerId);
    return miner ? names.character(miner.mainCharacterId) : l.minerId;
  };
  const columns: DataTableColumn<PeriodMinerLine>[] = [
    {
      id: 'miner',
      header: t('corpTaxBook.moons.cols.miner'),
      primary: true,
      render: nameOf,
      sortValue: nameOf,
    },
    {
      id: 'billed',
      header: t('corpTaxBook.moons.cols.billed'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (l) => (l.amount ? isk(l.amount) : '—'),
      sortValue: (l) => l.amount,
    },
    {
      id: 'note',
      header: t('corpTaxBook.moons.cols.status'),
      render: (l) =>
        l.rolledOver ? (
          <span className="text-xs text-text-dim">
            {t('corpTaxBook.moons.statementPeriod.preview.rolledOver')}
          </span>
        ) : null,
      sortValue: (l) => (l.rolledOver ? 1 : 0),
    },
    ...(!cards ? [caretColumn<PeriodMinerLine>()] : []),
  ];
  return (
    <div className="space-y-4">
      <Crumb to={STATEMENTS_PATH} label={t('corpTaxBook.moons.tabs.statements')} />
      <PageHeader
        title={periodLabel(period.start, period.end)}
        meta={
          <span className="text-xs text-text-dim">
            {[
              t(`corpTaxBook.moons.periodStatus.${period.status}`),
              t('corpTaxBook.moons.statementPeriod.miners', { count: lines.length }),
            ].join(' · ')}
          </span>
        }
      />
      <StatChips>
        <StatChip label={t('corpTaxBook.moons.cols.billed')} value={isk(period.billed)} emphasis />
      </StatChips>
      <p className="text-xs text-text-dim">
        {t(`corpTaxBook.moons.statementPeriod.preview.${period.status as 'open'}`)}
      </p>
      <Panel
        title={t('corpTaxBook.moons.statementPeriod.preview.listTitle', { count: lines.length })}
        padded={false}
      >
        <div ref={tableRef} className="@container overflow-x-auto">
          <DataTable
            label={t('corpTaxBook.moons.statementPeriod.preview.listTitle', {
              count: lines.length,
            })}
            columns={columns}
            rows={lines}
            rowKey={(l) => l.minerId}
            density="compact"
            defaultSort={{ columnId: 'billed', direction: 'desc' }}
            mobileSort
            stacked={cards}
            stackColumns={2}
            onRowClick={(l) => navigate(minerPath(l.minerId))}
          />
        </div>
      </Panel>
    </div>
  );
}

/** An issued period's page (#5285): its totals, then one Statement per Miner. */
function IssuedPeriodDetail({ periodStart }: { periodStart: string }) {
  const { t } = useTranslation();
  const { view, names, canEdit } = useBook();
  const [recording, setRecording] = useState<PeriodStatementRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const [tableRef, cards] = useCards();
  const minerOf = (r: PeriodStatementRow) => view.miners.find((m) => m.id === r.statement.minerId);
  const nameOf = (r: PeriodStatementRow) => {
    const miner = minerOf(r);
    return miner ? names.character(miner.mainCharacterId) : r.statement.minerId;
  };
  const recordingMiner = recording ? minerOf(recording) : undefined;
  const rowContextMenu = (r: PeriodStatementRow, tr: ReactElement) => (
    <StatementRowMenu
      row={r}
      minerName={nameOf(r)}
      onRecord={(row) => run(() => setRecording(row))}
      onNotice={setNotice}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {tr}
    </StatementRowMenu>
  );
  const statements = periodStatements(view, periodStart);
  const period = periodRows(view).find((r) => r.start === periodStart && isIssuedPeriod(r));
  const statementParam = useStatementParam(
    statements !== undefined,
    (id) => statements?.some((r) => r.statement.id === id) ?? false
  );
  if (!statements || !period) {
    return (
      <div className="space-y-4">
        <Crumb to={STATEMENTS_PATH} label={t('corpTaxBook.moons.tabs.statements')} />
        <EmptyState title={t('corpTaxBook.moons.statementPeriod.notFound')} />
      </div>
    );
  }
  const columns: DataTableColumn<PeriodStatementRow>[] = [
    {
      id: 'miner',
      header: t('corpTaxBook.moons.cols.miner'),
      primary: true,
      render: nameOf,
      sortValue: nameOf,
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
      id: 'due',
      header: t('corpTaxBook.moons.cols.due'),
      render: (r) => (
        <DueWord
          dueAt={r.dueAt}
          now={view.input.now}
          pausedUntil={r.state === 'paused' ? r.pausedUntil : null}
        />
      ),
      sortValue: (r) => r.dueAt ?? '',
    },
    {
      id: 'mail',
      header: t('corpTaxBook.moons.cols.mail'),
      render: (r) => <MailWord mail={r.mail} />,
      sortValue: (r) => r.mail.kind,
    },
    // A view-only user has no ⋮ at the row's end: the caret says the row opens.
    ...(!canEdit && !cards ? [caretColumn<PeriodStatementRow>()] : []),
  ];
  const unpaid = statements.filter((r) => !r.settled);
  const overdueCount = unpaid.filter((r) => r.state === 'overdue').length;
  const pausedCount = unpaid.filter((r) => r.state === 'paused').length;
  return (
    <div className="space-y-4">
      <Crumb to={STATEMENTS_PATH} label={t('corpTaxBook.moons.tabs.statements')} />
      <PageHeader
        title={periodLabel(period.start, period.end)}
        meta={
          <span className="text-xs text-text-dim">
            {[
              period.issuedAt
                ? t('corpTaxBook.moons.statementPeriod.issued', {
                    date: shortDate(period.issuedAt),
                  })
                : null,
              t('corpTaxBook.moons.statementPeriod.miners', { count: period.miners }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        }
      />
      <StatChips>
        <StatChip
          label={t('corpTaxBook.moons.cols.outstanding')}
          value={period.outstanding ? isk(period.outstanding) : '—'}
          emphasis
        />
        <StatChip label={t('corpTaxBook.moons.cols.billed')} value={isk(period.billed)} />
        <StatChip
          label={t('corpTaxBook.moons.cols.paid')}
          value={period.paid ? isk(period.paid) : '—'}
        />
      </StatChips>
      <p className="text-xs text-text-dim">
        {[
          t('corpTaxBook.moons.statementPeriod.unpaidOf', {
            unpaid: unpaid.length,
            total: statements.length,
          }),
          overdueCount > 0
            ? t('corpTaxBook.moons.statementPeriod.overdueCount', { count: overdueCount })
            : null,
          pausedCount > 0
            ? t('corpTaxBook.moons.statementPeriod.pausedCount', { count: pausedCount })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p
        role="status"
        className={(notice ?? statementParam.notFound) ? 'text-xs text-text-dim' : 'sr-only'}
      >
        {notice ?? statementParam.notFound}
      </p>
      <Panel
        title={t('corpTaxBook.moons.statementPeriod.listTitle', { count: statements.length })}
        padded={false}
      >
        <div ref={tableRef} className="@container overflow-x-auto">
          <DataTable
            label={t('corpTaxBook.moons.tabs.statements')}
            columns={columns}
            rows={statements}
            rowKey={(r) => r.statement.id}
            density="compact"
            {...(canEdit ? { rowContextMenu } : {})}
            rowMoreActions={canEdit}
            defaultSort={{ columnId: 'outstanding', direction: 'desc' }}
            mobileSort
            stacked={cards}
            stackColumns={2}
            onRowClick={(r) => statementParam.open(r.statement.id)}
            selectedRowKey={statementParam.selectedId}
          />
        </div>
      </Panel>
      {statementParam.openId && (
        <StatementPanel
          key={statementParam.openId}
          statementId={statementParam.openId}
          onClose={statementParam.close}
        />
      )}
      {recording && recordingMiner && (
        <RecordPaymentDialog
          open
          onClose={() => setRecording(null)}
          miner={recordingMiner}
          minerName={names.character(recordingMiner.mainCharacterId)}
          defaultAmount={recording.outstanding}
          statementId={recording.statement.id}
        />
      )}
    </div>
  );
}
