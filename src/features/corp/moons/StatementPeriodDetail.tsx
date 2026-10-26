import { useCallback, useState, type ReactElement } from 'react';
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
  periodRows,
  periodStatements,
  type PeriodStatementRow,
} from '@/engine/corpTaxBook/bookView';
import { tabPath } from '@/lib/pageTabs';
import { RecordPaymentDialog } from './BookDialogs';
import { StatementRowMenu } from './StatementRowMenu';
import { useBook } from './useBook';
import { MOONS_TABS } from './moonsPaths';
import { isk, periodLabel, shortDate } from './moonsFormat';
import { Crumb, DueWord } from './moonsParts';
import { useCards } from './sectionHelpers';

const STATEMENTS_PATH = tabPath(MOONS_TABS, 'statements');

function MailWord({ mail }: { mail: PeriodStatementRow['mail'] }) {
  const { t } = useTranslation();
  if (mail.kind === 'stopped') {
    return (
      <Tooltip content={t('corpTaxBook.moons.statementPeriod.stoppedTip', { count: mail.count })}>
        <span className="text-warning">{t('corpTaxBook.moons.statementPeriod.stopped')}</span>
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

/** An issued period's page (#5285): its totals, then one Statement per Miner. */
export function StatementPeriodDetail({ periodStart }: { periodStart: string }) {
  const { t } = useTranslation();
  const { view, names, canEdit } = useBook();
  const [recording, setRecording] = useState<PeriodStatementRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const [tableRef, cards] = useCards();
  const minerOf = (r: PeriodStatementRow) => view.miners.find((m) => m.id === r.statement.minerId);
  const rowContextMenu = useCallback(
    (r: PeriodStatementRow, tr: ReactElement) => {
      const miner = view.miners.find((m) => m.id === r.statement.minerId);
      return (
        <StatementRowMenu
          row={r}
          minerName={miner ? names.character(miner.mainCharacterId) : r.statement.minerId}
          onRecord={(row) => run(() => setRecording(row))}
          onNotice={setNotice}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {tr}
        </StatementRowMenu>
      );
    },
    [view, names, run, onCloseAutoFocus]
  );
  const statements = periodStatements(view, periodStart);
  const period = periodRows(view).find((r) => r.start === periodStart && r.statements > 0);
  if (!statements || !period) {
    return (
      <div className="space-y-4">
        <Crumb to={STATEMENTS_PATH} label={t('corpTaxBook.moons.tabs.statements')} />
        <EmptyState title={t('corpTaxBook.moons.statementPeriod.notFound')} />
      </div>
    );
  }
  const nameOf = (r: PeriodStatementRow) => {
    const miner = view.miners.find((m) => m.id === r.statement.minerId);
    return miner ? names.character(miner.mainCharacterId) : r.statement.minerId;
  };
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
      render: (r) => <DueWord dueAt={r.dueAt} now={view.input.now} />,
      sortValue: (r) => r.dueAt ?? '',
    },
    {
      id: 'mail',
      header: t('corpTaxBook.moons.cols.mail'),
      render: (r) => <MailWord mail={r.mail} />,
      sortValue: (r) => r.mail.kind,
    },
  ];
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
        <StatChip label={t('corpTaxBook.moons.cols.billed')} value={isk(period.billed)} />
        <StatChip label={t('corpTaxBook.moons.cols.paid')} value={isk(period.paid)} />
        <StatChip
          label={t('corpTaxBook.moons.cols.outstanding')}
          value={isk(period.outstanding)}
          emphasis
        />
      </StatChips>
      {notice && (
        <p role="status" className="text-xs text-text-dim">
          {notice}
        </p>
      )}
      <Panel padded={false}>
        <div ref={tableRef} className="@container overflow-x-auto">
          <DataTable
            label={t('corpTaxBook.moons.tabs.statements')}
            columns={columns}
            rows={statements}
            rowKey={(r) => r.statement.id}
            density="compact"
            rowContextMenu={rowContextMenu}
            rowMoreActions={canEdit}
            defaultSort={{ columnId: 'outstanding', direction: 'desc' }}
            mobileSort
            stacked={cards}
            stackColumns={2}
          />
        </div>
      </Panel>
      {recording && minerOf(recording) && (
        <RecordPaymentDialog
          open
          onClose={() => setRecording(null)}
          miner={minerOf(recording)!}
          minerName={names.character(minerOf(recording)!.mainCharacterId)}
          defaultAmount={recording.outstanding}
          statementId={recording.statement.id}
        />
      )}
    </div>
  );
}
