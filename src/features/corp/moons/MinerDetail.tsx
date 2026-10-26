import { formatCount } from '@/lib/formatCount';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  FilterChip,
  HeaderMoreMenu,
  InfoTooltip,
  MenuItem,
  PageHeader,
  textActionClassName,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import {
  activityFeed,
  daysByPhase,
  minerMoons,
  moonByStructure,
  paymentLedger,
  type ActivityKind,
  type LedgerRow,
  type MinerMoon,
} from '@/engine/corpTaxBook/bookSections';
import { minerDetail, type DayRow, type DayStatus } from '@/engine/corpTaxBook/bookView';
import type { Adjustment } from '@/engine/corpTaxBook/statements';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { listQueue } from '@/features/corpTaxBook/mailQueueStore';
import { AuditLine } from './AuditFeed';
import { useBookAudit } from './useBookAudit';
import { useBook } from './useBook';
import { CloseAccountDialog } from './CloseAccountDialog';
import { MarkNotTaxDialog, ReasonDialog, RecordPaymentDialog } from './BookDialogs';
import { isk, shortDate, shortDateTime } from './moonsFormat';
import { extractionPath } from './moonsPaths';
import { Crumb, StandingWord } from './moonsParts';
import { MinerCharacters } from './MinerCharacters';
import { CorrectionsMenu } from './MinerCorrections';
import { OreLinesTable } from './OreLinesTable';
import { BookSection, EntityHeader, PlaceCell } from './sectionParts';
import { useMinerReminder } from './statementMailing';

const STATUS_TONE: Record<DayStatus, string> = {
  paid: 'text-success',
  'on-statement': 'text-danger',
  unbilled: 'text-text',
  'not-billable': 'text-text-dim',
  dismissed: 'text-text-dim line-through decoration-text-faint',
  'written-off': 'text-text-dim line-through decoration-text-faint',
};

type Detail = NonNullable<ReturnType<typeof minerDetail>>;
type Payment = Detail['payments'][number];
type PaymentRow = LedgerRow<Payment, Adjustment>;

/**
 * A Miner's page (#4056 step 4, sections #5247): the owed figure and its facts first, then one
 * scroll of Next Statement, Still accruing, Earlier days, Payments (corrections are a kind of
 * row in it), Moons and Activity (mail, dismissals and the audit log behind filter chips).
 * No inner tabs; each section carries its count and pages its newest ten rows.
 */
export function MinerDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, edit, canEdit, corporationId, data } = ctx;
  const phone = useIsPhone();
  const detail = minerDetail(view, id);
  const audit = useBookAudit();
  const queue = useLiveQuery(() => listQueue(corporationId), [corporationId], []);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<'all' | ActivityKind>('all');
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
  const phases = useMemo(() => daysByPhase(detail?.days ?? []), [detail]);
  const moons = useMemo(() => minerMoons(view, id), [view, id]);
  const moonOf = useMemo(() => moonByStructure(view), [view]);
  const ledger = useMemo(
    () =>
      paymentLedger(
        detail?.payments ?? [],
        data.adjustments.filter((a) => a.minerId === id)
      ),
    [detail, data.adjustments, id]
  );
  const feed = useMemo(
    () =>
      activityFeed({
        mail: queue
          .filter((m) => statementIds.has(m.statementId))
          .map((m) => ({ id: m.id, at: m.createdAt, mail: m })),
        dismissed: (detail?.dismissals ?? []).map((d) => ({
          id: d.id,
          at: Date.parse(d.at),
          dismissal: d,
        })),
        audit: minerAudit,
      }),
    [queue, statementIds, detail, minerAudit]
  );
  const shownFeed = feed.filter((f) => filter === 'all' || f.kind === filter);

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
  const paidTotal = detail.payments.reduce((s, p) => s + p.credited, 0);
  const selectedDays = detail.days.filter((d) => selected.has(d.key));
  const selectedTax = selectedDays.reduce((s, d) => s + d.tax, 0);
  const canSelect = (d: DayRow) => d.status === 'unbilled' || d.status === 'not-billable';
  const sumTax = (days: readonly DayRow[]) => days.reduce((s, d) => s + d.tax, 0);
  const moonName = (moonId: number | undefined) =>
    moonId === undefined ? undefined : names.moon(moonId);
  const noun = (key: string) => t(`corpTaxBook.moons.sections.nouns.${key}`);

  const dayColumns = (withSelect: boolean, withStatus: boolean): DataTableColumn<DayRow>[] => [
    ...(withSelect && canEdit
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
      render: (d) => (
        <PlaceCell
          refinery={names.refinery(d.structureId)}
          moon={moonName(d.moonId ?? moonOf.get(d.structureId))}
          to={d.extractionId === undefined ? undefined : extractionPath(d.extractionId)}
        />
      ),
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
    ...(withStatus
      ? [
          {
            id: 'status',
            header: t('corpTaxBook.moons.cols.status'),
            render: (d: DayRow) => (
              <span className={cx('text-xs whitespace-nowrap', STATUS_TONE[d.status])}>
                {t(`corpTaxBook.moons.dayStatus.${d.status}`)}
              </span>
            ),
          } satisfies DataTableColumn<DayRow>,
        ]
      : []),
  ];

  const dismissSelected =
    canEdit && selected.size > 0 ? (
      <Button size="sm" onClick={() => setDialog({ kind: 'dismiss' })}>
        {t('corpTaxBook.moons.miner.dismissSelected', { count: selected.size })}
      </Button>
    ) : undefined;

  const daysSection = (
    title: string,
    key: 'nextStatement' | 'stillAccruing' | 'earlier',
    hint: string,
    opts: { select: boolean; status: boolean; startOpen: boolean }
  ) => (
    <BookSection
      title={title}
      noun={noun('days')}
      rows={phases[key]}
      meta={<span className="text-xs text-text-dim">{hint}</span>}
      actions={opts.select ? dismissSelected : undefined}
      phone={phone}
      startOpen={opts.startOpen}
      summary={t('corpTaxBook.moons.miner.daysSummary', {
        count: phases[key].length,
        tax: isk(sumTax(phases[key])),
      })}
    >
      {(shown) => (
        <DataTable
          label={title}
          columns={dayColumns(opts.select, opts.status)}
          rows={[...shown]}
          rowKey={(d) => d.key}
          density="compact"
          stackLayout="dense"
        />
      )}
    </BookSection>
  );

  const paymentColumns: DataTableColumn<PaymentRow>[] = [
    {
      id: 'at',
      header: t('corpTaxBook.moons.cols.when'),
      render: (r) => shortDateTime(r.at),
    },
    {
      id: 'from',
      header: t('corpTaxBook.moons.cols.from'),
      primary: true,
      render: (r) =>
        r.kind === 'payment' ? (
          <span>
            {names.character(r.payment.characterId)}
            <span className="block text-xs text-text-dim">
              {t(`corpTaxBook.moons.payment.${r.payment.source}`)}
            </span>
          </span>
        ) : (
          <span>
            {r.correction.reason}
            <span className="block text-xs text-text-dim">
              {t('corpTaxBook.moons.payment.correction', {
                name: names.character(r.correction.by),
              })}
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
      render: (r) =>
        r.kind === 'payment' ? (
          <span className="text-isk-pos">+{isk(r.payment.amount)}</span>
        ) : (
          <span className={r.correction.amount < 0 ? 'text-isk-pos' : undefined}>
            {isk(r.correction.amount)}
          </span>
        ),
    },
    {
      id: 'credited',
      header: t('corpTaxBook.moons.cols.creditedTo'),
      render: (r) =>
        r.kind === 'correction' ? (
          <span className="text-xs text-text-dim">
            {t('corpTaxBook.moons.payment.correctsDay', { date: shortDate(r.correction.date) })}
          </span>
        ) : r.payment.notTaxAmount ? (
          <span className="text-xs text-warning">
            {t('corpTaxBook.moons.payment.markedNotTax', { amount: isk(r.payment.notTaxAmount) })}
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
            render: (r: PaymentRow) =>
              r.kind === 'payment' ? (
                <button
                  type="button"
                  className={textActionClassName('shrink-0')}
                  onClick={() => setDialog({ kind: 'notTax', payment: r.payment })}
                >
                  {t('corpTaxBook.moons.payment.markNotTax')}
                </button>
              ) : null,
          } satisfies DataTableColumn<PaymentRow>,
        ]
      : []),
  ];

  const moonColumns: DataTableColumn<MinerMoon>[] = [
    {
      id: 'moon',
      header: t('corpTaxBook.moons.cols.moon'),
      primary: true,
      render: (m) => (
        <PlaceCell
          refinery={names.refinery(m.structureId)}
          moon={m.moonId === undefined ? undefined : names.moon(m.moonId)}
        />
      ),
      sortValue: (m) => (m.moonId === undefined ? '' : names.moon(m.moonId)),
    },
    {
      id: 'days',
      header: t('corpTaxBook.moons.cols.days'),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => m.days,
      sortValue: (m) => m.days,
    },
    {
      id: 'last',
      header: t('corpTaxBook.moons.cols.lastDay'),
      render: (m) => shortDate(m.lastDate),
      sortValue: (m) => m.lastDate,
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.tax'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (m) => isk(m.tax),
      sortValue: (m) => m.tax,
    },
  ];

  const headerActions = canEdit ? (
    <span className="flex items-center gap-1">
      <Button onClick={() => setDialog({ kind: 'record' })}>
        {t('corpTaxBook.moons.miner.record')}
      </Button>
      {reminder.block ? (
        <Tooltip content={reminder.block}>
          <Button variant="ghost" aria-disabled="true">
            {t('corpTaxBook.moons.miner.remind')}
          </Button>
        </Tooltip>
      ) : (
        <Button variant="ghost" onClick={() => void reminder.send()}>
          {t('corpTaxBook.moons.miner.remind')}
        </Button>
      )}
      {row.standing === 'guest' && !closedAt ? (
        <HeaderMoreMenu>
          <MenuItem onSelect={() => setDialog({ kind: 'dismissAll' })}>
            {t('corpTaxBook.moons.miner.dismissAll')}
          </MenuItem>
          <MenuItem onSelect={() => setDialog({ kind: 'close' })}>
            {t('corpTaxBook.moons.miner.closeAccount')}
          </MenuItem>
        </HeaderMoreMenu>
      ) : (
        <Button variant="ghost" onClick={() => setDialog({ kind: 'dismissAll' })}>
          {t('corpTaxBook.moons.miner.dismissAll')}
        </Button>
      )}
    </span>
  ) : undefined;

  return (
    <div className="space-y-4">
      <Crumb to="/corp/moons/miners" label={t('corpTaxBook.moons.tabs.miners')} />
      <PageHeader
        title={name}
        meta={
          <span className="flex items-center gap-2 text-xs text-text-dim">
            <StandingWord standing={row.standing} />
            <MinerCharacters miner={row} />
          </span>
        }
        actions={headerActions}
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
      <EntityHeader
        label={t('corpTaxBook.moons.chips.owed')}
        value={isk(row.owed)}
        tone={row.owed ? 'danger' : undefined}
        note={
          row.overdueDays === null
            ? undefined
            : t('corpTaxBook.moons.miner.overdueNote', { count: row.overdueDays })
        }
        facts={[
          { label: t('corpTaxBook.moons.miner.paid'), value: isk(paidTotal) },
          { label: t('corpTaxBook.moons.chips.credit'), value: isk(row.credit) },
          {
            label: t('corpTaxBook.moons.chips.unbilled'),
            value: (
              <span className="inline-flex items-center gap-1">
                {isk(row.unbilled)}
                <InfoTooltip
                  label={t('corpTaxBook.moons.chips.unbilled')}
                  content={t('corpTaxBook.moons.miner.unbilledTip', { pending: isk(row.pending) })}
                  glyph="info"
                />
              </span>
            ),
          },
          { label: t('corpTaxBook.moons.chips.pending'), value: isk(row.pending) },
          {
            label: t('corpTaxBook.moons.miner.writtenOff'),
            value: (
              <span className="inline-flex items-center gap-1">
                {t('corpTaxBook.moons.miner.writtenOffValue', {
                  tolerance: isk(toleranceTotal),
                  count: detail.lateWriteOffs.length,
                })}
                <InfoTooltip
                  label={t('corpTaxBook.moons.miner.writtenOff')}
                  content={t('corpTaxBook.moons.miner.writtenOffTip', { late: isk(lateTotal) })}
                  glyph="info"
                />
              </span>
            ),
          },
        ]}
      />
      {daysSection(
        t('corpTaxBook.moons.sections.nextStatement'),
        'nextStatement',
        t('corpTaxBook.moons.miner.daysHint', {
          date: view.billableThrough ? shortDate(view.billableThrough) : '—',
        }),
        { select: true, status: false, startOpen: true }
      )}
      {daysSection(
        t('corpTaxBook.moons.sections.stillAccruing'),
        'stillAccruing',
        t('corpTaxBook.moons.miner.accruingHint'),
        { select: true, status: false, startOpen: false }
      )}
      {daysSection(
        t('corpTaxBook.moons.sections.earlierDays'),
        'earlier',
        t('corpTaxBook.moons.miner.earlierHint'),
        { select: false, status: true, startOpen: false }
      )}
      <BookSection
        title={t('corpTaxBook.moons.miner.payments')}
        noun={noun('payments')}
        rows={ledger}
        meta={
          <span className="text-xs text-text-dim">{t('corpTaxBook.moons.miner.paymentsHint')}</span>
        }
        actions={<CorrectionsMenu miner={row} days={detail.days} statements={detail.statements} />}
        phone={phone}
        summary={t('corpTaxBook.moons.miner.paymentsSummary', {
          count: ledger.length,
          amount: isk(paidTotal),
        })}
      >
        {(shown) => (
          <>
            <DataTable
              label={t('corpTaxBook.moons.miner.payments')}
              columns={paymentColumns}
              rows={[...shown]}
              rowKey={(r) => `${r.kind}-${r.id}`}
              density="compact"
              stackLayout="dense"
            />
            <p className="border-t border-line px-3 py-2 text-xs text-text-dim tabular-nums">
              {t('corpTaxBook.moons.miner.sum', {
                billed: isk(detail.statements.reduce((s, x) => s + x.amount, 0)),
                written: isk(toleranceTotal),
                owed: isk(row.owed),
              })}
            </p>
          </>
        )}
      </BookSection>
      <BookSection
        title={t('corpTaxBook.moons.miner.moons')}
        noun={noun('moons')}
        rows={moons}
        meta={
          <span className="text-xs text-text-dim">{t('corpTaxBook.moons.miner.moonsHint')}</span>
        }
        phone={phone}
        startOpen={false}
        summary={moons
          .map((m) =>
            m.moonId === undefined ? names.refinery(m.structureId) : names.moon(m.moonId)
          )
          .join(' · ')}
      >
        {(shown) => (
          <DataTable
            label={t('corpTaxBook.moons.miner.moons')}
            columns={moonColumns}
            rows={[...shown]}
            rowKey={(m) => m.key}
            expandableRow={{
              leadingIcon: true,
              renderDetail: (m) => (
                <OreLinesTable
                  lines={m.lines}
                  label={t('corpTaxBook.moons.miner.oreAt', {
                    moon:
                      m.moonId === undefined ? names.refinery(m.structureId) : names.moon(m.moonId),
                  })}
                  foot={
                    m.extractionId !== undefined && (
                      <Link to={extractionPath(m.extractionId)} className={entityLinkClassName()}>
                        {t('corpTaxBook.moons.miner.openMoon')}
                      </Link>
                    )
                  }
                />
              ),
            }}
            density="compact"
            stackLayout="dense"
          />
        )}
      </BookSection>
      <BookSection
        title={t('corpTaxBook.moons.miner.activity')}
        noun={noun('activity')}
        rows={shownFeed}
        count={feed.length}
        meta={
          <span className="text-xs text-text-dim">{t('corpTaxBook.moons.miner.activityHint')}</span>
        }
        toolbar={
          <>
            {(['all', 'mail', 'dismissed', 'audit'] as const).map((f) => (
              <FilterChip
                key={f}
                label={t(`corpTaxBook.moons.miner.filter.${f}`)}
                selected={filter === f}
                onToggle={() => setFilter(f)}
                count={f === 'all' ? feed.length : feed.filter((x) => x.kind === f).length}
              />
            ))}
          </>
        }
        phone={phone}
        startOpen={false}
        summary={t('corpTaxBook.moons.miner.activitySummary', { count: feed.length })}
      >
        {(shown) => (
          <ul className="divide-y divide-line px-3 text-sm">
            {shown.map((f) => {
              if (f.kind === 'audit') return <AuditLine key={`a-${f.id}`} entry={f.item} />;
              if (f.kind === 'mail') {
                const m = f.item.mail;
                return (
                  <li
                    key={`m-${f.id}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5"
                  >
                    <span className="w-28 shrink-0 text-xs text-text-dim tabular-nums">
                      {shortDateTime(new Date(f.at).toISOString())}
                    </span>
                    <span className="min-w-0 flex-1">{m.subject}</span>
                    <span className="text-text-dim">
                      {t(`corpTaxBook.mailQueue.status.${m.status}`, { defaultValue: m.status })}
                    </span>
                  </li>
                );
              }
              const d = f.item.dismissal;
              return (
                <li
                  key={`d-${f.id}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5"
                >
                  <span className="w-28 shrink-0 text-xs text-text-dim tabular-nums">
                    {shortDateTime(d.at)}
                  </span>
                  <span className="min-w-0 flex-1">
                    {t(`corpTaxBook.moons.miner.scope.${d.scope}`)}
                    <span className="block text-xs text-text-dim">
                      {names.character(d.by)} · “{d.reason}”
                      {d.reversed && ` · ${t('corpTaxBook.moons.miner.reversed')}`}
                    </span>
                  </span>
                  {canEdit && !d.reversed && (
                    <button
                      type="button"
                      className={textActionClassName('shrink-0')}
                      onClick={() => setDialog({ kind: 'reverse', dismissalId: d.id })}
                    >
                      {t('corpTaxBook.moons.miner.reverse')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </BookSection>

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
