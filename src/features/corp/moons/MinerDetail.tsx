import { formatCount } from '@/lib/formatCount';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  FilterChip,
  HeaderMoreMenu,
  InfoTooltip,
  DropdownMenuItem,
  PageHeader,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import {
  activityFeed,
  daysByPhase,
  minerMoons,
  statementAdjustment,
  moonByStructure,
  paymentLedger,
  type ActivityKind,
  type LedgerRow,
  type MinerMoon,
} from '@/engine/corpTaxBook/bookSections';
import { minerDetail, type DayRow, type DayStatus } from '@/engine/corpTaxBook/bookView';
import { wholeIsk } from '@/engine/corpTaxBook/wholeIsk';
import type { Adjustment, Statement } from '@/engine/corpTaxBook/statements';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { listQueue } from '@/features/corpTaxBook/mailQueueStore';
import { ActivityRow, AuditLine } from './AuditFeed';
import { useBookAudit } from './useBookAudit';
import { useBook } from './useBook';
import { CloseAccountDialog } from './CloseAccountDialog';
import { MarkNotTaxDialog, ReasonDialog, RecordPaymentDialog } from './BookDialogs';
import { isk, iskOrDash, periodLabel, shortDate, shortDateTime, signedIsk } from './moonsFormat';
import type { AuditEntry } from '../taxBook/bookClient';
import { extractionPath } from './moonsPaths';
import { Crumb, StandingWord } from './moonsParts';
import { MinerCharacters } from './MinerCharacters';
import { CorrectionsMenu } from './MinerCorrections';
import { OreLinesTable } from './OreLinesTable';
import { dayEndTime } from './dayEndTime';
import { BookSection, EntityHeader, PlaceCell } from './sectionParts';
import { moonLabel, tapTargetClassName } from './sectionHelpers';
import { StatementPanel } from './StatementPanel';
import { useStatementParam } from './useStatementParam';
import { oldestOpenStatement, useMinerReminder } from './statementMailing';

const STATUS_TONE: Record<DayStatus, string> = {
  paid: 'text-success',
  'on-statement': 'text-text-dim',
  unbilled: 'text-text',
  'not-billable': 'text-text-dim',
  dismissed: 'text-text-dim line-through decoration-text-faint',
  'written-off': 'text-text-dim line-through decoration-text-faint',
};

type Detail = NonNullable<ReturnType<typeof minerDetail>>;
type Payment = Detail['payments'][number];
type PaymentRow = LedgerRow<Payment, Adjustment>;

/**
 * A Miner's page: the owed figure and its facts first, then one
 * scroll of Today's mining, Next Statement, Earlier days, Payments (corrections are a kind of
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
  const statementParam = useStatementParam(detail !== undefined, (sid) => statementIds.has(sid));
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
          .map((m) => ({
            id: m.id,
            at: m.createdAt,
            mailId: m.mailId === undefined ? undefined : String(m.mailId),
            mail: m,
          })),
        dismissed: (detail?.dismissals ?? []).map((d) => ({
          id: d.id,
          at: Date.parse(d.at),
          dismissal: d,
        })),
        audit: minerAudit,
      }),
    [queue, statementIds, detail, minerAudit]
  );
  // The Statement (period and amount) or payment amount an entry is about.
  const auditContext = (e: AuditEntry): ReactNode => {
    const { statementId, amount } = e.detail;
    const st =
      typeof statementId === 'string'
        ? detail?.statements.find((x) => x.id === statementId)
        : undefined;
    if (st) {
      return (
        <>
          {statementLink(st)}
          {e.action === 'issueStatement' && <> · {isk(st.amount)}</>}
        </>
      );
    }
    return typeof amount === 'number' ? (amount < 0 ? signedIsk(amount) : isk(amount)) : null;
  };
  const shownFeed = feed.filter((f) => filter === 'all' || f.chip === filter);

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
  const openStatement = oldestOpenStatement(view, id);
  const closedAt = view.input.miners.find((m) => m.id === id)?.closedAt;
  // Tolerance shortfalls and officer write-offs (#4637) both come off what is owed.
  const toleranceTotal =
    detail.toleranceWriteOffs.reduce((s, w) => s + w.amount, 0) +
    detail.officerWriteOffs.reduce((s, w) => s + w.amount, 0);
  const lateTotal = detail.lateWriteOffs.reduce((s, w) => s + w.tax, 0);
  const paidTotal = detail.payments.reduce((s, p) => s + p.credited, 0);
  const billedTotal = detail.statements.reduce((s, x) => s + x.amount, 0);
  const selectedDays = detail.days.filter((d) => selected.has(d.key));
  const selectedTax = selectedDays.reduce((s, d) => s + d.tax, 0);
  const canSelect = (d: DayRow) => d.status === 'unbilled' || d.status === 'not-billable';
  const sumTax = (days: readonly DayRow[]) => days.reduce((s, d) => s + d.tax, 0);
  const moonName = (moonId: number | undefined) =>
    moonId === undefined ? undefined : names.moon(moonId);
  /** What a dismissal waived, in words: the day, the moon or the extraction it was aimed at. */
  const dismissalWhat = (d: NonNullable<typeof detail>['dismissals'][number]) => {
    if (d.scope === 'record') {
      const day = detail.days.find((x) => x.key === d.targetId);
      return day ? shortDate(day.date) : d.targetId;
    }
    if (d.scope === 'miner') return '';
    if (d.scope === 'moon')
      return Number.isFinite(Number(d.targetId)) ? names.moon(Number(d.targetId)) : d.targetId;
    const x = view.extractions.find((e) => e.id === d.targetId);
    return x ? names.moon(x.moonId) : d.targetId;
  };
  const noun = (key: string) => t(`corpTaxBook.moons.sections.nouns.${key}`);

  /** A Statement's period as a link that opens the shared Statement panel (#5288). */
  const statementLink = (st: Statement) => (
    <button
      type="button"
      className={entityLinkClassName(cx('whitespace-nowrap', tapTargetClassName))}
      aria-label={t('corpTaxBook.moons.payment.openStatement', {
        period: periodLabel(st.periodStart, st.periodEnd),
      })}
      onClick={() => statementParam.open(st.id)}
    >
      {periodLabel(st.periodStart, st.periodEnd)}
    </button>
  );
  const statementOf = (statementId: string | undefined) =>
    statementId === undefined ? undefined : detail.statements.find((x) => x.id === statementId);

  // The three day tables share one grid (select, day, moon, character, ore, rate, tax), so a
  // reader's eye keeps its column from one section to the next: Earlier days keeps the select
  // gutter (empty) and says each day's status under its ore instead of in a column of its own.
  const dayMoon = (d: DayRow) => moonName(d.moonId ?? moonOf.get(d.structureId));
  const dayColumns = (
    withSelect: boolean,
    withStatus: boolean,
    cards: boolean
  ): DataTableColumn<DayRow>[] => [
    ...(canEdit && !(cards && !withSelect)
      ? [
          {
            id: 'select',
            header: '',
            className: 'w-8',
            stackEdge: 'start',
            render: (d: DayRow) =>
              canSelect(d) ? (
                <label className={cx(touchCheckboxLabelClassName, 'size-6')}>
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
      className: 'w-24',
      header: t('corpTaxBook.moons.cols.day'),
      render: (d) => shortDate(d.date),
      sortValue: (d) => d.date,
    },
    {
      id: 'where',
      className: 'w-60',
      header: t('corpTaxBook.moons.cols.moon'),
      primary: true,
      render: (d) => (
        <PlaceCell
          refinery={names.refinery(d.structureId)}
          moon={dayMoon(d)}
          to={d.extractionId === undefined ? undefined : extractionPath(d.extractionId)}
        />
      ),
      sortValue: (d) => dayMoon(d) ?? names.refinery(d.structureId),
    },
    // One character mined every day: a column repeating the page's own name is width for nothing.
    ...(row.characterIds.length > 1
      ? [
          {
            id: 'character',
            className: 'w-44',
            header: t('corpTaxBook.moons.cols.character'),
            render: (d: DayRow) => names.character(d.characterId),
            sortValue: (d: DayRow) => names.character(d.characterId),
          } satisfies DataTableColumn<DayRow>,
        ]
      : []),
    {
      id: 'ore',
      header: t('corpTaxBook.moons.cols.ore'),
      // On a card the ore is a line of its own: a long list wrapped inside the meta line leaves a dangling dot.
      stackEdge: 'below',
      render: (d) => (
        <span>
          {d.oreLines
            .map((l) => `${names.ore(l.typeId)}\u00a0×\u00a0${formatCount(l.quantity)}`)
            .join(', ')}
          {withStatus && (
            <span className={cx('block text-xs whitespace-nowrap', STATUS_TONE[d.status])}>
              {t(`corpTaxBook.moons.dayStatus.${d.status}`)}
              {(() => {
                const st = statementOf(d.statementId);
                return st && <> · {statementLink(st)}</>;
              })()}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'rate',
      header: t('corpTaxBook.moons.cols.rate'),
      align: 'right',
      className: 'w-20 tabular-nums',
      render: (d) => `${d.taxPct}%`,
      sortValue: (d) => d.taxPct,
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.tax'),
      align: 'right',
      className: 'w-36 tabular-nums',
      cardCorner: true,
      cellClassName: (d) =>
        d.status === 'dismissed' || d.status === 'written-off' ? 'line-through text-text-dim' : '',
      render: (d) => isk(d.tax),
      sortValue: (d) => d.tax,
    },
  ];

  const dismissSelected =
    canEdit && selectedDays.length > 0 ? (
      <Button size="sm" onClick={() => setDialog({ kind: 'dismiss' })}>
        {t('corpTaxBook.moons.miner.dismissSelected', { count: selectedDays.length })}
      </Button>
    ) : undefined;

  const daysSection = (
    title: string,
    key: 'nextStatement' | 'stillAccruing' | 'earlier',
    meta: ReactNode,
    opts: { select: boolean; status: boolean; startOpen: boolean }
  ) => {
    const columns = dayColumns(opts.select, opts.status, phone);
    const adjust = key === 'nextStatement' ? statementAdjustment(phases.nextStatement, row) : 0;
    return (
      <BookSection
        title={title}
        noun={noun('days')}
        empty={t(`corpTaxBook.moons.miner.empty.${key === 'earlier' ? 'earlier' : key}`)}
        rows={phases[key]}
        sortColumns={columns}
        meta={meta}
        actions={opts.select ? dismissSelected : undefined}
        phone={phone}
        startOpen={opts.startOpen}
        summary={t('corpTaxBook.moons.miner.daysSummary', {
          count: phases[key].length,
          tax: isk(sumTax(phases[key]) + adjust),
        })}
      >
        {(shown, table) => (
          <DataTable
            label={title}
            columns={columns}
            rows={[...shown]}
            rowKey={(d) => d.key}
            density="compact"
            stackLayout="dense"
            mobileSort
            {...table}
          />
        )}
      </BookSection>
    );
  };

  /** The Statement a correction line was billed on; undefined while it waits for the next one. */
  const billedOn = (adjustmentId: string) =>
    detail.statements.find((x) => x.lines.some((l) => l.adjustmentId === adjustmentId));

  const paymentCredited = (payment: Payment) => {
    // Only Statements the payment put at least 1 ISK on; a fraction is not a credit (#5247).
    const credited = detail.paymentCredits
      .filter((c) => c.paymentId === payment.id && wholeIsk(c.amount) >= 1)
      .flatMap((c) => {
        const st = statementOf(c.statementId);
        return st ? [{ st, amount: c.amount }] : [];
      });
    const hidden = credited.slice(2);
    return (
      <span className="text-xs">
        {credited.length > 0 ? (
          <span className="flex flex-col">
            {credited.slice(0, 2).map(({ st, amount }) => (
              <span key={st.id}>
                {statementLink(st)}
                <span className="text-text-dim"> · {isk(amount)}</span>
              </span>
            ))}
            {hidden.length > 0 && (
              <Tooltip
                content={hidden
                  .map(({ st }) => periodLabel(st.periodStart, st.periodEnd))
                  .join(', ')}
              >
                <span tabIndex={0} className="w-fit text-text-dim">
                  {t('corpTaxBook.moons.payment.moreStatements', { count: hidden.length })}
                </span>
              </Tooltip>
            )}
          </span>
        ) : (
          !payment.notTaxAmount && (
            <span className="text-text-dim">{t('corpTaxBook.moons.payment.oldestFirst')}</span>
          )
        )}
        {payment.notTaxAmount ? (
          <span className="block text-warning">
            {t('corpTaxBook.moons.payment.markedNotTax', { amount: isk(payment.notTaxAmount) })}
          </span>
        ) : null}
      </span>
    );
  };

  const paymentColumns: DataTableColumn<PaymentRow>[] = [
    {
      id: 'at',
      header: t('corpTaxBook.moons.cols.when'),
      render: (r) => shortDateTime(r.at),
      sortValue: (r) => r.at,
      sortFirst: 'desc',
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
              {t(
                r.correction.amount < 0
                  ? 'corpTaxBook.moons.payment.correctionCredit'
                  : 'corpTaxBook.moons.payment.correctionCharge',
                { name: names.character(r.correction.by) }
              )}
            </span>
          </span>
        ),
      sortValue: (r) =>
        r.kind === 'payment' ? names.character(r.payment.characterId) : r.correction.reason,
    },
    {
      id: 'amount',
      header: t('corpTaxBook.moons.cols.amount'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (r) =>
        r.kind === 'payment' ? (
          <span className="text-isk-pos">{isk(r.payment.amount)}</span>
        ) : (
          <span className={r.correction.amount < 0 ? 'text-isk-pos' : 'text-warning'}>
            {signedIsk(r.correction.amount)}
          </span>
        ),
      sortValue: (r) => (r.kind === 'payment' ? r.payment.amount : r.correction.amount),
    },
    {
      id: 'credited',
      header: t('corpTaxBook.moons.cols.creditedTo'),
      render: (r) =>
        r.kind === 'correction' ? (
          <span className="text-xs text-text-dim">
            {(() => {
              const st = billedOn(r.correction.id);
              const date = shortDate(r.correction.date);
              return st ? (
                <Trans
                  i18nKey="corpTaxBook.moons.payment.billedOn"
                  values={{ period: periodLabel(st.periodStart, st.periodEnd), date }}
                  components={{ link: statementLink(st) }}
                />
              ) : (
                t('corpTaxBook.moons.payment.correctsDay', { date })
              );
            })()}
          </span>
        ) : (
          paymentCredited(r.payment)
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
                  className={entityLinkClassName(
                    cx('shrink-0 whitespace-nowrap', tapTargetClassName)
                  )}
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
      sortValue: (m) => moonLabel(names, m),
    },
    {
      id: 'days',
      header: t('corpTaxBook.moons.cols.days'),
      align: 'right',
      className: 'tabular-nums',
      stackAffix: { after: t('corpTaxBook.moons.sections.affix.days') },
      render: (m) => m.days,
      sortValue: (m) => m.days,
    },
    {
      id: 'last',
      header: t('corpTaxBook.moons.cols.lastDay'),
      stackAffix: { before: t('corpTaxBook.moons.sections.affix.last') },
      render: (m) => shortDate(m.lastDate),
      sortValue: (m) => m.lastDate,
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.tax'),
      align: 'right',
      className: 'w-36 tabular-nums',
      cardCorner: true,
      render: (m) => isk(m.tax),
      sortValue: (m) => m.tax,
    },
  ];

  const guestOpen = row.standing === 'guest' && !closedAt;
  // The reason a disabled action is inert, printed under it: a menu item has no tooltip on touch.
  const remindItem = reminder.block ? (
    <DropdownMenuItem
      aria-disabled
      onSelect={(event) => event.preventDefault()}
      className="aria-disabled:opacity-50"
    >
      <span>
        {t('corpTaxBook.moons.miner.remind')}
        <span className="block text-xs text-text-dim">{reminder.block}</span>
      </span>
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem onSelect={() => void reminder.send()}>
      {t('corpTaxBook.moons.miner.remind')}
    </DropdownMenuItem>
  );
  const dismissAllItem = (
    <DropdownMenuItem onSelect={() => setDialog({ kind: 'dismissAll' })}>
      {t('corpTaxBook.moons.miner.dismissAll')}
    </DropdownMenuItem>
  );
  const closeItem = guestOpen ? (
    <DropdownMenuItem onSelect={() => setDialog({ kind: 'close' })}>
      {t('corpTaxBook.moons.miner.closeAccount')}
    </DropdownMenuItem>
  ) : null;
  // A phone's header is one row: the primary action and a ⋮ holding the rest. Wider, the first
  // three buttons never move: Close account, for a guest, is a fourth after them.
  const headerActions = canEdit ? (
    <span className="flex items-center gap-1">
      <Button onClick={() => setDialog({ kind: 'record' })}>
        {t('corpTaxBook.moons.miner.record')}
      </Button>
      {phone ? (
        <HeaderMoreMenu>
          {remindItem}
          {dismissAllItem}
          {closeItem}
        </HeaderMoreMenu>
      ) : (
        <>
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
          <Button variant="ghost" onClick={() => setDialog({ kind: 'dismissAll' })}>
            {t('corpTaxBook.moons.miner.dismissAll')}
          </Button>
          {guestOpen && (
            <Button variant="ghost" onClick={() => setDialog({ kind: 'close' })}>
              {t('corpTaxBook.moons.miner.closeAccount')}
            </Button>
          )}
        </>
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
      <p
        role="status"
        className={(notice ?? statementParam.notFound) ? 'text-xs text-text-dim' : 'sr-only'}
      >
        {notice ?? statementParam.notFound}
      </p>
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
          row.overdueDays !== null
            ? t('corpTaxBook.moons.miner.overdueNote', { count: row.overdueDays })
            : row.paused
              ? t('corpTaxBook.moons.miner.overduePausedNote')
              : undefined
        }
        facts={[
          { label: t('corpTaxBook.moons.miner.paid'), value: iskOrDash(paidTotal) },
          { label: t('corpTaxBook.moons.chips.credit'), value: iskOrDash(row.credit) },
          {
            label: t('corpTaxBook.moons.chips.unbilled'),
            value: (
              <span className="inline-flex items-center gap-1">
                {iskOrDash(row.unbilled)}
                <InfoTooltip
                  label={t('corpTaxBook.moons.chips.unbilled')}
                  content={t('corpTaxBook.moons.miner.unbilledTip', { pending: isk(row.pending) })}
                  glyph="info"
                />
              </span>
            ),
          },
          { label: t('corpTaxBook.moons.chips.pending'), value: iskOrDash(row.pending) },
          // Nothing written off, nothing to say: the fact would be a row of zeros.
          ...(toleranceTotal === 0 && detail.lateWriteOffs.length === 0
            ? []
            : [
                {
                  label: t('corpTaxBook.moons.miner.writtenOff'),
                  value: (
                    <span className="inline-flex items-center gap-1">
                      {detail.lateWriteOffs.length === 0
                        ? isk(toleranceTotal)
                        : t('corpTaxBook.moons.miner.writtenOffValue', {
                            tolerance: isk(toleranceTotal),
                            count: detail.lateWriteOffs.length,
                          })}
                      <InfoTooltip
                        label={t('corpTaxBook.moons.miner.writtenOff')}
                        content={t('corpTaxBook.moons.miner.writtenOffTip', {
                          late: isk(lateTotal),
                        })}
                        glyph="info"
                      />
                    </span>
                  ),
                },
              ]),
        ]}
      />
      {daysSection(
        t('corpTaxBook.moons.sections.stillAccruing'),
        'stillAccruing',
        <InfoTooltip
          label={t('corpTaxBook.moons.sections.stillAccruing')}
          content={t('corpTaxBook.moons.miner.dayEndTip', {
            time: dayEndTime(view.input.graceHours),
          })}
          glyph="info"
        />,
        { select: true, status: false, startOpen: false }
      )}
      {daysSection(
        t('corpTaxBook.moons.sections.nextStatement'),
        'nextStatement',
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.miner.daysHint')}</span>,
        { select: true, status: false, startOpen: true }
      )}
      {daysSection(
        t('corpTaxBook.moons.sections.earlierDays'),
        'earlier',
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.miner.earlierHint')}</span>,
        { select: false, status: true, startOpen: false }
      )}
      <BookSection
        title={t('corpTaxBook.moons.miner.payments')}
        noun={noun('payments')}
        empty={t('corpTaxBook.moons.miner.empty.payments')}
        rows={ledger}
        sortColumns={paymentColumns}
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
        {(shown, table) => (
          <>
            <DataTable
              label={t('corpTaxBook.moons.miner.payments')}
              columns={paymentColumns}
              rows={[...shown]}
              rowKey={(r) => `${r.kind}-${r.id}`}
              density="compact"
              stackLayout="dense"
              mobileSort
              {...table}
            />
            <p className="border-t border-line px-3 py-2 text-xs text-text-dim tabular-nums">
              {t('corpTaxBook.moons.miner.sum', {
                billed: isk(billedTotal),
                written: iskOrDash(toleranceTotal),
                settled: isk(billedTotal - toleranceTotal - row.owed),
                owed: isk(row.owed),
              })}
            </p>
          </>
        )}
      </BookSection>
      <BookSection
        title={t('corpTaxBook.moons.miner.moons')}
        noun={noun('moons')}
        empty={t('corpTaxBook.moons.miner.empty.moons')}
        rows={moons}
        sortColumns={moonColumns}
        meta={
          <span className="text-xs text-text-dim">{t('corpTaxBook.moons.miner.moonsHint')}</span>
        }
        phone={phone}
        startOpen={false}
        summary={t('corpTaxBook.moons.miner.moonsSummary', {
          count: moons.length,
          tax: isk(moons.reduce((sum, m) => sum + m.tax, 0)),
        })}
      >
        {(shown, table) => (
          <DataTable
            {...table}
            label={t('corpTaxBook.moons.miner.moons')}
            columns={moonColumns}
            rows={[...shown]}
            rowKey={(m) => m.key}
            expandableRow={{
              leadingIcon: true,
              renderDetail: (m) => (
                <OreLinesTable
                  lines={m.lines}
                  label={t('corpTaxBook.moons.miner.oreAt', { moon: moonLabel(names, m) })}
                  foot={
                    m.extractionId !== undefined && (
                      <Link
                        to={extractionPath(m.extractionId)}
                        className={entityLinkClassName(tapTargetClassName)}
                      >
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
        empty={t('corpTaxBook.moons.miner.empty.activity')}
        rows={shownFeed}
        count={feed.length}
        meta={
          <span className="text-xs text-text-dim">{t('corpTaxBook.moons.miner.activityHint')}</span>
        }
        toolbar={
          feed.length === 0 ? undefined : (
            <div
              role="group"
              aria-label={t('corpTaxBook.moons.miner.filter.label')}
              className="flex flex-wrap items-center gap-1"
            >
              {(['all', 'mail', 'dismissed', 'audit'] as const).map((f) => (
                <FilterChip
                  key={f}
                  label={t(`corpTaxBook.moons.miner.filter.${f}`)}
                  selected={filter === f}
                  onToggle={() => setFilter(f)}
                  count={f === 'all' ? feed.length : feed.filter((x) => x.chip === f).length}
                  // Nothing to filter to: an empty chip is not a choice.
                  disabled={f !== 'all' && !feed.some((x) => x.chip === f) && filter !== f}
                />
              ))}
            </div>
          )
        }
        phone={phone}
        startOpen={false}
        summary={t('corpTaxBook.moons.miner.activitySummary', { count: feed.length })}
      >
        {(shown) => (
          <ul className="divide-y divide-line px-3 text-sm">
            {shown.map((f) => {
              if (f.kind === 'audit')
                return (
                  <AuditLine key={`a-${f.id}`} entry={f.item} context={auditContext(f.item)} />
                );
              if (f.kind === 'mail') {
                const m = f.item.mail;
                return (
                  <ActivityRow
                    key={`m-${f.id}`}
                    at={new Date(f.at).toISOString()}
                    aside={
                      <span className="text-text-dim">
                        {t(`corpTaxBook.mailQueue.status.${m.status}`, { defaultValue: m.status })}
                      </span>
                    }
                  >
                    {m.subject}
                  </ActivityRow>
                );
              }
              const d = f.item.dismissal;
              return (
                <ActivityRow
                  key={`d-${f.id}`}
                  at={d.at}
                  aside={
                    canEdit && !d.reversed ? (
                      <button
                        type="button"
                        className={entityLinkClassName(
                          cx('shrink-0 whitespace-nowrap', tapTargetClassName)
                        )}
                        onClick={() => setDialog({ kind: 'reverse', dismissalId: d.id })}
                      >
                        {t('corpTaxBook.moons.miner.reverse')}
                      </button>
                    ) : undefined
                  }
                >
                  <span className="font-semibold">{names.character(d.by)}</span>{' '}
                  {t(`corpTaxBook.moons.miner.dismissedFor.${d.scope}`, {
                    what: dismissalWhat(d),
                  })}
                  <span className="text-text-dim">
                    {' '}
                    · “{d.reason}”{d.reversed && ` · ${t('corpTaxBook.moons.miner.reversed')}`}
                  </span>
                </ActivityRow>
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
          statementLabel={
            openStatement
              ? periodLabel(openStatement.periodStart, openStatement.periodEnd)
              : undefined
          }
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
      {statementParam.openId && (
        <StatementPanel
          key={statementParam.openId}
          statementId={statementParam.openId}
          onClose={statementParam.close}
          showMinerLink={false}
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
