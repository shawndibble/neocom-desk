import { formatCount } from '@/lib/formatCount';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  PageHeader,
  Panel,
  StatChip,
  StatChips,
  textActionClassName,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { minerDetail, type DayRow, type DayStatus } from '@/engine/corpTaxBook/bookView';
import { cx } from '@/lib/cx';
import { listQueue } from '@/features/corpTaxBook/mailQueueStore';
import { AuditFeed } from './AuditFeed';
import { useBookAudit } from './useBookAudit';
import { useBook } from './useBook';
import { CloseAccountDialog } from './CloseAccountDialog';
import { MarkNotTaxDialog, ReasonDialog, RecordPaymentDialog } from './BookDialogs';
import { isk, shortDate, shortDateTime } from './moonsFormat';
import { Crumb, StandingWord } from './moonsParts';
import { MinerCharacters } from './MinerCharacters';
import { MinerCorrections } from './MinerCorrections';
import { useMinerReminder } from './statementMailing';

const STATUS_TONE: Record<DayStatus, string> = {
  paid: 'text-success',
  'on-statement': 'text-danger',
  unbilled: 'text-text',
  'not-billable': 'text-text-dim',
  dismissed: 'text-text-dim line-through decoration-text-faint',
  'written-off': 'text-text-dim line-through decoration-text-faint',
};

type Payment = NonNullable<ReturnType<typeof minerDetail>>['payments'][number];

/** A Miner's page (#4056 step 4): days, payments, dismissals, mail and activity. */
export function MinerDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, edit, canEdit, corporationId } = ctx;
  const detail = minerDetail(view, id);
  const audit = useBookAudit();
  const queue = useLiveQuery(() => listQueue(corporationId), [corporationId], []);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<
    | { kind: 'record' }
    | { kind: 'dismiss' }
    | { kind: 'dismissAll' }
    | { kind: 'close' }
    | { kind: 'notTax'; payment: Payment }
    | { kind: 'reverse'; dismissalId: string }
    | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reminder = useMinerReminder(id, setNotice);

  const statementIds = useMemo(() => new Set(detail?.statements.map((s) => s.id)), [detail]);
  const paymentIds = useMemo(() => new Set(detail?.payments.map((p) => p.id)), [detail]);
  const minerAudit = useMemo(
    () =>
      audit.entries.filter((e) => {
        const d = e.detail;
        return (
          d.minerId === id ||
          statementIds.has(d.statementId as string) ||
          paymentIds.has(d.paymentId as string)
        );
      }),
    [audit.entries, id, statementIds, paymentIds]
  );

  if (!detail) {
    return (
      <div className="space-y-4">
        <Crumb to="/corp/moons/miners" label={t('corpTaxBook.moons.tabs.miners')} />
        <EmptyState title={t('corpTaxBook.moons.miner.notFound')} />
      </div>
    );
  }
  const { row } = detail;
  const name = names.character(row.mainCharacterId);
  const openStatement = detail.statements.find(
    (s) => !view.internals.byMiner.get(id)?.allocation.byStatement.get(s.id)?.settled
  );
  const closedAt = view.input.miners.find((m) => m.id === id)?.closedAt;
  // Tolerance shortfalls and officer write-offs (#4637) both come off what is owed.
  const toleranceTotal =
    detail.toleranceWriteOffs.reduce((s, w) => s + w.amount, 0) +
    detail.officerWriteOffs.reduce((s, w) => s + w.amount, 0);
  const lateTotal = detail.lateWriteOffs.reduce((s, w) => s + w.tax, 0);
  const selectedDays = detail.days.filter((d) => selected.has(d.key));
  const selectedTax = selectedDays.reduce((s, d) => s + d.tax, 0);
  const canSelect = (d: DayRow) => d.status === 'unbilled' || d.status === 'not-billable';

  const dayColumns: DataTableColumn<DayRow>[] = [
    ...(canEdit
      ? [
          {
            id: 'select',
            header: '',
            className: 'w-8',
            render: (d: DayRow) =>
              canSelect(d) ? (
                <label className={touchCheckboxLabelClassName}>
                  <Checkbox
                    aria-label={t('corpTaxBook.moons.miner.selectDay', { date: d.date })}
                    checked={selected.has(d.key)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (!next.delete(d.key)) next.add(d.key);
                        return next;
                      })
                    }
                  />
                </label>
              ) : null,
          } satisfies DataTableColumn<DayRow>,
        ]
      : []),
    {
      id: 'date',
      header: t('corpTaxBook.moons.cols.day'),
      render: (d) => shortDate(d.date),
      sortValue: (d) => d.date,
    },
    {
      id: 'where',
      header: t('corpTaxBook.moons.cols.refinery'),
      render: (d) => {
        const refinery = names.refinery(d.structureId);
        // Structure names usually already carry their moon ("Jita IV - Moon 2 - ...").
        const moon = d.moonId === undefined ? '' : names.moon(d.moonId);
        return (
          <span className="block min-w-0">
            {refinery}
            {moon !== '' && !refinery.includes(moon) && (
              <span className="block text-xs text-text-dim">{moon}</span>
            )}
          </span>
        );
      },
    },
    {
      id: 'character',
      header: t('corpTaxBook.moons.cols.character'),
      render: (d) => names.character(d.characterId),
    },
    {
      id: 'ore',
      header: t('corpTaxBook.moons.cols.ore'),
      primary: true,
      render: (d) => (
        <span>
          {d.oreLines.map((l) => `${names.ore(l.typeId)} × ${formatCount(l.quantity)}`).join(', ')}
        </span>
      ),
    },
    {
      id: 'rate',
      header: t('corpTaxBook.moons.cols.rate'),
      align: 'right',
      className: 'tabular-nums',
      render: (d) => `${d.taxPct}%`,
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.tax'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      cellClassName: (d) =>
        d.status === 'dismissed' || d.status === 'written-off' ? 'line-through text-text-dim' : '',
      render: (d) => isk(d.tax),
      sortValue: (d) => d.tax,
    },
    {
      id: 'status',
      header: t('corpTaxBook.moons.cols.status'),
      render: (d) => (
        <span className={cx('text-xs whitespace-nowrap', STATUS_TONE[d.status])}>
          {t(`corpTaxBook.moons.dayStatus.${d.status}`)}
        </span>
      ),
    },
  ];

  const paymentColumns: DataTableColumn<Payment>[] = [
    { id: 'at', header: t('corpTaxBook.moons.cols.when'), render: (p) => shortDateTime(p.at) },
    {
      id: 'from',
      header: t('corpTaxBook.moons.cols.from'),
      primary: true,
      render: (p) => (
        <span>
          {names.character(p.characterId)}
          <span className="block text-xs text-text-dim">
            {t(`corpTaxBook.moons.payment.${p.source}`)}
          </span>
        </span>
      ),
    },
    {
      id: 'amount',
      header: t('corpTaxBook.moons.cols.amount'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (p) => <span className="text-isk-pos">+{isk(p.amount)}</span>,
    },
    {
      id: 'credited',
      header: t('corpTaxBook.moons.cols.creditedTo'),
      render: (p) =>
        p.notTaxAmount ? (
          <span className="text-xs text-warning">
            {t('corpTaxBook.moons.payment.markedNotTax', { amount: isk(p.notTaxAmount) })}
          </span>
        ) : (
          <span className="text-xs text-text-dim">
            {t('corpTaxBook.moons.payment.oldestFirst')}
          </span>
        ),
    },
    ...(canEdit
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right',
            render: (p: Payment) => (
              <button
                type="button"
                className={textActionClassName('shrink-0')}
                onClick={() => setDialog({ kind: 'notTax', payment: p })}
              >
                {t('corpTaxBook.moons.payment.markNotTax')}
              </button>
            ),
          } satisfies DataTableColumn<Payment>,
        ]
      : []),
  ];

  const miningMail = queue.filter((m) => statementIds.has(m.statementId));
  const active = detail.dismissals;

  return (
    <div className="space-y-4">
      <Crumb to="/corp/moons/miners" label={t('corpTaxBook.moons.tabs.miners')} />
      <PageHeader
        title={name}
        meta={
          <span className="flex items-center gap-2 text-xs text-text-dim">
            <StandingWord standing={row.standing} />
            {row.characterIds.length > 1 && (
              <span>{row.characterIds.map(names.character).join(', ')}</span>
            )}
          </span>
        }
        actions={
          canEdit ? (
            <span className="flex items-center gap-1">
              <Button size="sm" onClick={() => setDialog({ kind: 'record' })}>
                {t('corpTaxBook.moons.miner.record')}
              </Button>
              {reminder.block ? (
                <Tooltip content={reminder.block}>
                  <Button size="sm" variant="ghost" aria-disabled="true">
                    {t('corpTaxBook.moons.miner.remind')}
                  </Button>
                </Tooltip>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => void reminder.send()}>
                  {t('corpTaxBook.moons.miner.remind')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'dismissAll' })}>
                {t('corpTaxBook.moons.miner.dismissAll')}
              </Button>
              {row.standing === 'guest' && !closedAt && (
                <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'close' })}>
                  {t('corpTaxBook.moons.miner.closeAccount')}
                </Button>
              )}
            </span>
          ) : undefined
        }
      />
      {notice && (
        <p role="status" className="text-xs text-text-dim">
          {notice}
        </p>
      )}
      {closedAt && (
        <p role="status" className="text-xs text-text-dim">
          {t('corpTaxBook.moons.miner.closedNote', { date: shortDate(closedAt.slice(0, 10)) })}
        </p>
      )}
      <StatChips>
        <StatChip
          label={t('corpTaxBook.moons.chips.owed')}
          value={isk(row.owed)}
          tone={row.owed ? 'danger' : 'default'}
          emphasis
        />
        <StatChip
          label={t('corpTaxBook.moons.cols.overdue')}
          value={
            row.overdueDays === null
              ? '—'
              : t('corpTaxBook.moons.overdueDays', { count: row.overdueDays })
          }
          tone={row.overdueDays === null ? 'default' : 'danger'}
        />
        <StatChip
          label={t('corpTaxBook.moons.chips.unbilled')}
          value={isk(row.unbilled)}
          tooltip={t('corpTaxBook.moons.miner.unbilledTip', { pending: isk(row.pending) })}
          tooltipGlyph="info"
        />
        <StatChip label={t('corpTaxBook.moons.chips.credit')} value={isk(row.credit)} />
        <StatChip
          label={t('corpTaxBook.moons.miner.writtenOff')}
          value={t('corpTaxBook.moons.miner.writtenOffValue', {
            tolerance: isk(toleranceTotal),
            count: detail.lateWriteOffs.length,
          })}
          tooltip={t('corpTaxBook.moons.miner.writtenOffTip', { late: isk(lateTotal) })}
          tooltipGlyph="info"
        />
      </StatChips>
      <Panel
        title={t('corpTaxBook.moons.miner.days')}
        meta={
          <span className="text-xs text-text-dim">
            {t('corpTaxBook.moons.miner.daysHint', {
              date: view.billableThrough ? shortDate(view.billableThrough) : '—',
            })}
          </span>
        }
        padded={false}
        actions={
          canEdit && selected.size > 0 ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'dismiss' })}>
              {t('corpTaxBook.moons.miner.dismissSelected', { count: selected.size })}
            </Button>
          ) : undefined
        }
      >
        <DataTable
          label={t('corpTaxBook.moons.miner.days')}
          columns={dayColumns}
          rows={detail.days}
          rowKey={(d) => d.key}
          density="compact"
          stackLayout="dense"
        />
      </Panel>
      <MinerCorrections miner={row} days={detail.days} statements={detail.statements} />
      <Panel
        title={t('corpTaxBook.moons.miner.payments')}
        meta={
          <span className="text-xs text-text-dim">{t('corpTaxBook.moons.miner.paymentsHint')}</span>
        }
        padded={false}
      >
        <DataTable
          label={t('corpTaxBook.moons.miner.payments')}
          columns={paymentColumns}
          rows={detail.payments}
          rowKey={(p) => p.id}
          density="compact"
        />
        <p className="border-t border-line px-3 py-2 text-xs text-text-dim tabular-nums">
          {t('corpTaxBook.moons.miner.sum', {
            billed: isk(detail.statements.reduce((s, x) => s + x.amount, 0)),
            written: isk(toleranceTotal),
            owed: isk(row.owed),
          })}
        </p>
      </Panel>
      <MinerCharacters miner={row} />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t('corpTaxBook.moons.miner.dismissals')}>
          {active.length === 0 ? (
            <p className="text-sm text-text-dim">{t('corpTaxBook.moons.miner.noDismissals')}</p>
          ) : (
            active.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-3 text-sm">
                <p>
                  {t(`corpTaxBook.moons.miner.scope.${d.scope}`)}
                  <span className="block text-xs text-text-dim">
                    {names.character(d.by)}, {shortDate(d.at)} · “{d.reason}”
                    {d.reversed && ` · ${t('corpTaxBook.moons.miner.reversed')}`}
                  </span>
                </p>
                {canEdit && !d.reversed && (
                  <button
                    type="button"
                    className={textActionClassName('shrink-0')}
                    onClick={() => setDialog({ kind: 'reverse', dismissalId: d.id })}
                  >
                    {t('corpTaxBook.moons.miner.reverse')}
                  </button>
                )}
              </div>
            ))
          )}
        </Panel>
        <Panel title={t('corpTaxBook.moons.miner.mail')}>
          {miningMail.length === 0 ? (
            <p className="text-sm text-text-dim">{t('corpTaxBook.moons.miner.noMail')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {miningMail.map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span>{m.subject}</span>
                  <span className="text-text-dim">
                    {t(`corpTaxBook.mailQueue.status.${m.status}`, { defaultValue: m.status })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <Panel
        title={t('corpTaxBook.moons.miner.activity')}
        meta={
          <span className="text-xs text-text-dim">{t('corpTaxBook.moons.miner.activityHint')}</span>
        }
      >
        <AuditFeed entries={minerAudit} />
      </Panel>

      {dialog?.kind === 'record' && (
        <RecordPaymentDialog
          open
          onClose={() => setDialog(null)}
          miner={row}
          minerName={name}
          defaultAmount={row.owed}
          statementId={openStatement?.id}
        />
      )}
      {dialog?.kind === 'dismiss' && (
        <ReasonDialog
          open
          onClose={() => {
            setDialog(null);
            setSelected(new Set());
          }}
          title={t('corpTaxBook.moons.dialogs.dismissDays.title', { count: selectedDays.length })}
          intro={t('corpTaxBook.moons.dialogs.dismissDays.intro', { tax: isk(selectedTax) })}
          reasonLabel={t('corpTaxBook.moons.dialogs.reasonShown')}
          confirmLabel={t('corpTaxBook.moons.dialogs.dismissConfirm', { amount: isk(selectedTax) })}
          run={async (reason) => {
            // One act, so the Director-approval limit applies to the total, not each day.
            await edit({
              action: 'dismissRecords',
              targets: selectedDays.map((day) => ({ targetId: day.key, amountIsk: day.tax })),
              reason,
            });
          }}
        />
      )}
      {dialog?.kind === 'dismissAll' && (
        <ReasonDialog
          open
          onClose={() => setDialog(null)}
          title={t('corpTaxBook.moons.dialogs.dismissMiner.title', { name })}
          intro={t('corpTaxBook.moons.dialogs.dismissMiner.intro')}
          reasonLabel={t('corpTaxBook.moons.dialogs.reasonShown')}
          confirmLabel={t('corpTaxBook.moons.dialogs.dismissConfirm', {
            amount: isk(row.owed + row.unbilled),
          })}
          run={async (reason) => {
            await edit({
              action: 'dismiss',
              scope: 'miner',
              targetId: id,
              reason,
              amountIsk: row.owed + row.unbilled,
            });
          }}
        />
      )}
      {dialog?.kind === 'close' && (
        <CloseAccountDialog open onClose={() => setDialog(null)} miner={row} minerName={name} />
      )}
      {dialog?.kind === 'notTax' && (
        <MarkNotTaxDialog
          open
          onClose={() => setDialog(null)}
          payment={dialog.payment}
          fromName={names.character(dialog.payment.characterId)}
        />
      )}
      {dialog?.kind === 'reverse' && (
        <ReasonDialog
          open
          onClose={() => setDialog(null)}
          title={t('corpTaxBook.moons.dialogs.reverse.title')}
          intro={t('corpTaxBook.moons.dialogs.reverse.intro')}
          reasonLabel={t('corpTaxBook.moons.dialogs.reverse.reason')}
          confirmLabel={t('corpTaxBook.moons.dialogs.reverse.confirm')}
          run={async (reason) => {
            await edit({ action: 'reverseDismissal', dismissalId: dialog.dismissalId, reason });
          }}
        />
      )}
    </div>
  );
}
