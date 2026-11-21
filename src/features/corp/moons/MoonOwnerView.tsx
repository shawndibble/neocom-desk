import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  DataTable,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatChip,
  StatChips,
  TextInput,
} from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/InlineError';
import { payeeChangeNotice, payeeNoticeKey } from '@/engine/corpTaxBook/payeeChange';
import type { Payee } from '@/engine/corpTaxBook/payouts';
import type { FeederView } from '../taxBook/feederViewClient';
import {
  isSettledAfterLeaving,
  minedDayRows,
  minedMonths,
  pageState,
  payeeIdOf,
  parseRequestedRate,
  payoutRows,
  rateNote,
  viewRefineryLabeler,
  type MinedRow,
} from '../taxBook/feederViewModel';
import { DialogShell } from './BookDialogs';
import { RefineryLabels } from './RefineryLabels';
import { callableErrorText } from './feederErrorText';
import { ChangePayeeDialog, PayeeChangeStrip, PayeeLine } from './MoonOwnerPayee';
import { isk, monthLabel, shortDate } from './moonsFormat';

type Names = (characterId: number) => string;
/** An ore's name; undefined until it resolves. */
type TypeNames = (typeId: number) => string | undefined;

/** Page B's plain account: who handles the tax, what is owed, what was paid. */
function OwedToYou({ view, name }: { view: FeederView; name: string }) {
  const { t } = useTranslation();
  const s = view.summary;
  const rate = s.effectiveRatePct;
  const since = s.coverageFrom ? shortDate(s.coverageFrom) : null;
  const k = (key: string) => `corpTaxBook.moons.ownerView.account.${key}`;
  return (
    <Panel>
      <div className="space-y-1 text-sm">
        <p className="text-text-dim">{t(k('intro'), { name })}</p>
        {rate === null ? (
          <>
            <p>{t(k('noRate'))}</p>
            {(s.pendingValueIsk ?? 0) > 0 && (
              <p className="text-xs text-text-dim">
                {t(k('pending'), { value: isk(s.pendingValueIsk ?? 0) })}
              </p>
            )}
          </>
        ) : s.balanceKind === 'owed' ? (
          <>
            <p className="text-2xl font-semibold tabular-nums">{isk(s.balanceIsk)}</p>
            <p>
              {since ? t(k('owed'), { since, pct: rate }) : t(k('owedUndated'), { pct: rate })}{' '}
              {s.lastPayout
                ? t(k('paid'), {
                    paid: isk(s.paidIsk),
                    amount: isk(s.lastPayout.amount),
                    date: shortDate(s.lastPayout.date),
                  })
                : t(k('notPaid'))}
            </p>
          </>
        ) : s.balanceKind === 'credit' ? (
          <>
            <p className="text-2xl font-semibold tabular-nums">{isk(s.balanceIsk)}</p>
            <p>{t(k('credit'), { pct: rate })}</p>
          </>
        ) : (
          <p>
            {t(k('even'), { pct: rate })}{' '}
            {s.lastPayout &&
              t(k('paid'), {
                paid: isk(s.paidIsk),
                amount: isk(s.lastPayout.amount),
                date: shortDate(s.lastPayout.date),
              })}
          </p>
        )}
        {s.balanceKind !== 'none' && (
          <p className="text-xs text-text-dim">
            {t(k('accrued'), { accrued: isk(s.accruedIsk), paid: isk(s.paidIsk) })}
          </p>
        )}
        {s.unpricedDays > 0 && (
          <p className="text-xs text-text-dim">{t(k('unpriced'), { count: s.unpricedDays })}</p>
        )}
      </div>
    </Panel>
  );
}

/**
 * Settled otherwise: the note, mined volume and value. Nothing more builds up in ISK, but what was
 * owed before the switch stays owed and shows here until it is paid (#6209).
 */
function SettledOtherwise({
  view,
  name,
  payments,
}: {
  view: FeederView;
  name: string;
  payments: ReactNode;
}) {
  const { t } = useTranslation();
  const s = view.summary;
  const owed = s.balanceKind === 'owed';
  return (
    <>
      <Panel title={t('corpTaxBook.moons.ownerView.settledOtherwise.title')}>
        <div className="space-y-1 text-sm">
          <p>{t('corpTaxBook.moons.ownerView.settledOtherwise.intro', { name })}</p>
          {s.note && <p className="font-semibold">{s.note}</p>}
          {owed && (
            <p>
              <span className="text-2xl font-semibold tabular-nums">{isk(s.balanceIsk)}</span>{' '}
              {t('corpTaxBook.moons.ownerView.settledOtherwise.stillOwed')}
            </p>
          )}
          <p className="text-xs text-text-dim">
            {t('corpTaxBook.moons.ownerView.settledOtherwise.nothingOwed')}
          </p>
        </div>
      </Panel>
      {(owed || view.payouts.length > 0) && (
        <Panel title={t('corpTaxBook.moons.ownerView.paymentsToYou')}>{payments}</Panel>
      )}
      <StatChips>
        <StatChip
          label={t('corpTaxBook.moons.ownerView.minedValue')}
          value={isk(s.minedValueIsk)}
          emphasis
        />
        <StatChip
          label={t('corpTaxBook.moons.ownerView.minedVolume')}
          value={t('corpTaxBook.moons.ownerView.units', { volume: isk(s.minedVolume) })}
        />
        {s.coverageFrom && (
          <StatChip
            label={t('corpTaxBook.moons.ownerView.since')}
            value={shortDate(s.coverageFrom)}
          />
        )}
      </StatChips>
    </>
  );
}

/** The month filter's "every month" value: Radix Select has no empty value. */
const ALL_MONTHS = 'all';

/**
 * Who mined at the moon owner's refineries, per day, character, refinery and ore, so each day
 * can be checked against the moon owner's own ledger (#6210); a month at a time. Nothing is capped.
 */
function MinedTable({
  view,
  names,
  typeName,
  label,
  title,
}: {
  view: FeederView;
  names: Names;
  typeName?: TypeNames;
  label: (structureId: number) => string;
  title: string;
}) {
  const { t } = useTranslation();
  const months = minedMonths(view.days);
  const [picked, setPicked] = useState<string>(ALL_MONTHS);
  const month = picked !== ALL_MONTHS && months.includes(picked) ? picked : null;
  const rows = minedDayRows(view.days, month);
  const oreName = (r: MinedRow) =>
    r.typeId === null ? '—' : (typeName?.(r.typeId) ?? `#${r.typeId}`);
  const filterLabel = t('corpTaxBook.moons.ownerView.month');
  return (
    <Panel
      title={title}
      padded={rows.length === 0}
      actions={
        months.length > 1 ? (
          <Select value={month ?? ALL_MONTHS} onValueChange={setPicked}>
            <SelectTrigger aria-label={filterLabel} size="sm" active={month !== null}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MONTHS}>
                {t('corpTaxBook.moons.ownerView.allMonths')}
              </SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {monthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-dim">{t('corpTaxBook.moons.owner.noMining')}</p>
      ) : (
        <DataTable<MinedRow>
          label={title}
          rows={rows}
          rowKey={(r) => r.key}
          defaultSort={{ columnId: 'date', direction: 'desc' }}
          columns={[
            {
              id: 'date',
              header: t('corpTaxBook.moons.ownerView.cols.date'),
              className: 'tabular-nums whitespace-nowrap',
              render: (r) => shortDate(r.date),
              sortValue: (r) => r.date,
            },
            {
              id: 'character',
              header: t('corpTaxBook.moons.ownerView.cols.character'),
              primary: true,
              render: (r) => names(r.characterId),
              sortValue: (r) => names(r.characterId),
            },
            {
              id: 'refinery',
              header: t('corpTaxBook.moons.ownerView.cols.refinery'),
              render: (r) => label(r.structureId),
              sortValue: (r) => label(r.structureId),
            },
            {
              id: 'ore',
              header: t('corpTaxBook.moons.ownerView.cols.ore'),
              render: (r) => oreName(r),
              sortValue: (r) => oreName(r),
            },
            {
              id: 'volume',
              header: t('corpTaxBook.moons.ownerView.cols.volume'),
              align: 'right',
              className: 'tabular-nums',
              render: (r) => isk(r.volume),
              sortValue: (r) => r.volume,
            },
          ]}
        />
      )}
    </Panel>
  );
}

/** The rate line, with "Ask for a different rate" for the corporation's officers. */
function RateLine({
  view,
  name,
  onAskRate,
}: {
  view: FeederView;
  name: string;
  onAskRate?: () => void;
}) {
  const { t } = useTranslation();
  const note = rateNote(view.summary);
  const k = (key: string) => `corpTaxBook.moons.ownerView.rate.${key}`;
  return (
    <div className="space-y-1 text-sm">
      <p>
        {note.kind === 'none' && t(k('none'))}
        {note.kind === 'plain' && t(k('plain'), { pct: note.pct })}
        {note.kind === 'set' && t(k('set'), { pct: note.pct, name, date: shortDate(note.since) })}
        {note.kind === 'asked' && t(k('asked'), { pct: note.askedPct })}
        {note.kind === 'override' &&
          (note.since
            ? t(k('override'), {
                pct: note.agreedPct,
                name,
                date: shortDate(note.since),
                asked: note.askedPct,
              })
            : t(k('overrideUndated'), { pct: note.agreedPct, name, asked: note.askedPct }))}
      </p>
      {onAskRate && (
        <Button size="sm" onClick={onAskRate}>
          {t(k(note.kind === 'none' ? 'askFirst' : 'ask'))}
        </Button>
      )}
    </div>
  );
}

const METHOD = { donation: 'donation', other: 'other' } as const;

/**
 * The payments to the moon owner, newest first. With `onDispute` (its officers), each one can be
 * flagged as a payment it disputes, or the flag withdrawn (#6209); the accounting side sees it.
 */
function Payments({
  view,
  onDispute,
}: {
  view: FeederView;
  onDispute?: (payoutId: string, disputed: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const k = (key: string) => `corpTaxBook.moons.ownerView.payments.${key}`;
  const rows = payoutRows(view.payouts);
  if (rows.length === 0) return <p className="text-sm text-text-dim">{t(k('none'))}</p>;
  const toggle = async (id: string, disputed: boolean) => {
    if (!onDispute) return;
    setBusy(id);
    setFailed(false);
    try {
      await onDispute(id, disputed);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-1">
      <ul className="space-y-1 text-xs text-text-dim">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span>
              {shortDate(p.date)} · <span className="tabular-nums">{isk(p.amount)}</span> ·{' '}
              {t(k(`method.${METHOD[p.method]}`))} · {t(k(`status.${p.status}`))}
              {p.disputed && <span className="text-warning"> · {t(k('disputed'))}</span>}
            </span>
            {onDispute && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy === p.id}
                onClick={() => void toggle(p.id, !p.disputed)}
              >
                {t(k(p.disputed ? 'withdraw' : 'dispute'))}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {failed && <InlineError>{t(k('disputeFailed'))}</InlineError>}
    </div>
  );
}

/**
 * The moon owner's Pop Sharing opt-out (#6222): one switch for all its moons, on by default.
 * Off stops the accounting corporation sharing their pops at once; on lets it again.
 */
function PopSharingSwitch({
  name,
  share,
  onChange,
}: {
  name: string;
  share: boolean;
  /** Absent: shown, not changeable (not an officer who edits). */
  onChange?: (share: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = async (next: boolean) => {
    if (!onChange) return;
    setBusy(true);
    setError(null);
    try {
      await onChange(next);
    } catch (e) {
      setError(callableErrorText(t, e, 'corpTaxBook.moons.ownerView.popSharing.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={t('corpTaxBook.moons.ownerView.popSharing.title')}>
      <div className="space-y-2 text-sm">
        <label className="flex min-h-9 items-center gap-2">
          <Checkbox
            checked={share}
            disabled={!onChange || busy}
            onChange={(e) => void change(e.target.checked)}
          />
          {t('corpTaxBook.moons.ownerView.popSharing.label', { name })}
        </label>
        <p className="text-xs text-text-dim">
          {t('corpTaxBook.moons.ownerView.popSharing.hint', { name })}
        </p>
        {error && <InlineError>{error}</InlineError>}
      </div>
    </Panel>
  );
}

function AskRateDialog({
  initial,
  onClose,
  onRequest,
}: {
  initial: number | null;
  onClose: () => void;
  onRequest: (pct: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial === null ? '' : String(initial));
  const pct = parseRequestedRate(text);
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t('corpTaxBook.moons.ownerView.rate.dialogTitle')}
      confirmLabel={t('corpTaxBook.moons.ownerView.rate.confirm')}
      canConfirm={pct !== null}
      run={async () => {
        if (pct !== null) await onRequest(pct);
      }}
    >
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.ownerView.rate.field')}</span>
        <TextInput inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.ownerView.rate.hint')}</p>
    </DialogShell>
  );
}

/**
 * A moon owner's page from the server-written view: Page B, statement first,
 * then who mined at its refineries, then payments and rate. `banner` is the stale
 * ledger strip; `afterCard` sits between the after-leaving card and the history
 * (the own-book / paste-an-invite choice). Never says feeder or Collector.
 */
export function MoonOwnerView({
  view,
  names,
  typeName,
  nameOf,
  canEdit,
  onSetRefineryLabel,
  onRequestRate,
  onDisputePayout,
  onSetPopSharing,
  characterId,
  onSetPayee,
  banner,
  card,
  afterCard,
}: {
  view: FeederView;
  /** Character and corporation names, the payee's included. */
  names: Names;
  /** Ore names for the Mined table's Ore column. */
  typeName?: TypeNames;
  /** A resolved name (a system, the moon owner) or undefined, for the refinery label chain. */
  nameOf?: (id: number) => string | undefined;
  canEdit: boolean;
  /** Label a refinery for both sides; null clears it. With `canEdit`, shows the pencil. */
  onSetRefineryLabel?: (structureId: number, label: string | null) => Promise<void>;
  onRequestRate: (pct: number) => Promise<void>;
  /** Flag a payment as disputed, or withdraw it (#6209); with `canEdit`, shows Dispute. */
  onDisputePayout?: (payoutId: string, disputed: boolean) => Promise<void>;
  /** The Pop Sharing opt-out (#6222): false stops the pops being shared. With `canEdit`, it changes. */
  onSetPopSharing?: (share: boolean) => Promise<void>;
  /** Whose token the payee name search runs under; with `onSetPayee`, shows Change. */
  characterId?: number;
  onSetPayee?: (payee: Payee, name: string) => Promise<void>;
  banner?: ReactNode;
  card?: ReactNode;
  afterCard?: ReactNode;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [changingPayee, setChangingPayee] = useState(false);
  // The server takes a payee only while the moon owner is active or being removed.
  const payeeOpen = view.summary.status === 'active' || view.summary.status === 'pending-removal';
  const canSetPayee = payeeOpen && canEdit && onSetPayee !== undefined && characterId !== undefined;
  const state = pageState(view.summary);
  const name = view.summary.collectorName ?? t('corpTaxBook.moons.owner.anonymous');
  const ended = state === 'ended';
  const payments = (
    <Payments
      view={view}
      {...(canEdit && !ended && onDisputePayout ? { onDispute: onDisputePayout } : {})}
    />
  );
  const setBy = view.summary.payeeSetBy ?? null;
  // The accounting corporation changed who gets paid (#4653): a strip until dismissed.
  const payeeNotice = payeeChangeNotice({
    payee: view.summary.payee,
    payeeSetBy: setBy,
    viewer: 'moon-owner',
  });
  // Settled after leaving folds to its one line: no history under it.
  const folded = isSettledAfterLeaving(view.summary);
  const ownerName = nameOf?.(view.summary.feederCorporationId);
  const refineryName = viewRefineryLabeler(view.refineries, {
    ...(nameOf ? { systemName: nameOf } : {}),
    ...(ownerName ? { ownerName } : {}),
  });
  // The server takes a label until the moon owner leaves or is removed (disconnected included).
  const labelEdit =
    !ended && canEdit && onSetRefineryLabel
      ? {
          current: (id: number) => view.refineries.find((r) => r.structureId === id)?.label ?? '',
          onSave: onSetRefineryLabel,
        }
      : undefined;
  return (
    <div className="mx-auto max-w-page space-y-4">
      {banner}
      {payeeNotice && !ended && (
        <PayeeChangeStrip
          storageKey={payeeNoticeKey(
            view.summary.collectorCorporationId,
            view.summary.feederCorporationId
          )}
          at={payeeNotice.at}
          payeeName={names(payeeNotice.payee.id)}
          byName={name}
        />
      )}
      {card}
      {afterCard}
      {!folded && (
        <>
          {state === 'normal' && <OwedToYou view={view} name={name} />}
          {state === 'settled-otherwise' && (
            <SettledOtherwise view={view} name={name} payments={payments} />
          )}
          {(!ended || view.days.length > 0) && (
            <>
              <MinedTable
                view={view}
                names={names}
                typeName={typeName}
                label={refineryName}
                title={t(
                  ended
                    ? 'corpTaxBook.moons.ownerView.minedWhile'
                    : 'corpTaxBook.moons.ownerView.mined'
                )}
              />
              <RefineryLabels
                structureIds={view.refineries.map((r) => r.structureId)}
                name={refineryName}
                {...(labelEdit ? { edit: labelEdit } : {})}
              />
            </>
          )}
          {!ended && (
            <PopSharingSwitch
              name={name}
              share={view.summary.popSharingOptedOut !== true}
              {...(canEdit && onSetPopSharing ? { onChange: onSetPopSharing } : {})}
            />
          )}
          {state === 'normal' && (
            <Panel title={t('corpTaxBook.moons.ownerView.paymentsAndRate')}>
              <div className="space-y-3">
                <RateLine
                  view={view}
                  name={name}
                  onAskRate={canEdit ? () => setAsking(true) : undefined}
                />
                <PayeeLine
                  name={names(payeeIdOf(view.summary))}
                  {...(setBy
                    ? {
                        setBy: {
                          name: setBy.side === 'moon-owner' ? null : name,
                          at: setBy.at,
                        },
                      }
                    : {})}
                  onChange={canSetPayee ? () => setChangingPayee(true) : undefined}
                />
                {payments}
              </div>
            </Panel>
          )}
          {ended && view.payouts.length > 0 && (
            <Panel title={t('corpTaxBook.moons.ownerView.paymentsToYou')}>
              <Payments view={view} />
            </Panel>
          )}
        </>
      )}
      {asking && (
        <AskRateDialog
          initial={view.summary.requestedRatePct}
          onClose={() => setAsking(false)}
          onRequest={onRequestRate}
        />
      )}
      {changingPayee && canSetPayee && (
        <ChangePayeeDialog
          characterId={characterId}
          onClose={() => setChangingPayee(false)}
          onSave={onSetPayee}
        />
      )}
    </div>
  );
}
