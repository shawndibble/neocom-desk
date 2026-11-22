/**
 * The Corp Tax Book's officer dialogs (#4056 steps 5-9, #4063): every one is a
 * `Modal` (a sheet on a phone) that says who it is logged as, runs one edit
 * through `useBook().edit` (`editBook`, role re-checked live on the server)
 * and shows the refusal's mapped reason when it refuses.
 */
import { useTimeZone } from '@/lib/timeFormat';
import { useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FieldError,
  IskInput,
  Modal,
  SegmentedControl,
  TextArea,
  TextInput,
} from '@/components/ui';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { previewMinerPayment } from '@/engine/corpTaxBook/paymentPreview';
import { netPayment } from '@/engine/corpTaxBook/payments';
import { utcDay } from '@/engine/localDay';
import { lockDateFor } from '../../../../functions/src/corpTaxBookCheckpoint';
import { useIsPhone } from '@/lib/useIsPhone';
import { callableErrorReason } from '@/lib/callableError';
import { callableErrorText } from './feederErrorText';
import { useBook } from './useBook';
import {
  atDateWithYear,
  dateTimeAt,
  dateWithYear,
  isk,
  newId,
  paidAtFor,
  wallClock,
} from './moonsFormat';
import { MinerPicker } from './MinerPicker';
import { useBookMiners } from './useBookMiners';
import { DonationPicker, PaymentOutcomePanel } from './RecordPaymentParts';
import { DialogFooter } from '@/components/ui/DialogFooter';
import { Well } from '@/components/ui/Well';
import { PAYMENT_NOTE_MAX } from '../../../../functions/src/corpTaxBookKinds';

export function Label({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-text-dim">{text}</span>
      {children}
    </label>
  );
}

/**
 * `Label`'s look for a group that names itself (a `SegmentedControl` with its own `label`): a
 * `<label>` around buttons would add its text to the first button's name, so it is read twice.
 */
export function GroupLabel({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <span aria-hidden className="block text-xs text-text-dim">
        {text}
      </span>
      {children}
    </div>
  );
}

/** The longest note the server keeps on a payment (`recordPayment`'s `note`). */

interface ShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  confirmLabel: string;
  canConfirm: boolean;
  run: () => Promise<void>;
  /** A destructive confirm (§6c): the confirm button is `danger`, not `primary`. */
  danger?: boolean;
  /**
   * The "logged under your name" footer note: `true` says it is logged with the reason the
   * dialog asks for, `'plain'` is for a dialog that asks for none, `false` drops the note.
   */
  showLogged?: boolean | 'plain';
  /** The field focus starts in, instead of the dialog body. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/** Modal + confirm button + busy state + the server's refusal. */
export function DialogShell({
  open,
  onClose,
  title,
  confirmLabel,
  canConfirm,
  run,
  danger = false,
  showLogged = true,
  initialFocusRef,
  children,
}: ShellProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await run();
      onClose();
    } catch (e) {
      setError(callableErrorText(t, e, 'corpTaxBook.moons.dialogs.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      initialFocusRef={initialFocusRef}
      placement={phone ? 'sheet' : 'center'}
      footer={
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => void confirm()}
            disabled={!canConfirm || busy}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      }
    >
      <div className="space-y-3 text-sm">
        {children}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {showLogged && (
          <p className="text-xs text-text-dim">
            {t(
              showLogged === 'plain'
                ? 'corpTaxBook.moons.dialogs.loggedPlain'
                : 'corpTaxBook.moons.dialogs.logged'
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function Effect({ children }: { children: ReactNode }) {
  return (
    <Well as="p" className="text-xs tabular-nums">
      {children}
    </Well>
  );
}

/**
 * One reason, one action: Dismiss, Reject declaration, Write off and Reverse
 * dismissal are all this with different words and a different `run`.
 */
export function ReasonDialog({
  open,
  onClose,
  title,
  intro,
  reasonLabel,
  confirmLabel,
  effect,
  canConfirm = true,
  nextStep,
  run,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: ReactNode;
  reasonLabel: string;
  confirmLabel: string;
  effect?: ReactNode;
  /** False holds the action back whatever the reason says (the intro says why). */
  canConfirm?: boolean;
  /** A second REQUIRED field (keeping a bill: what the member should do next), sent as `run`'s 2nd argument. */
  nextStep?: { label: string; hint: string };
  run: (reason: string, nextStep: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [step, setStep] = useState('');
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      confirmLabel={confirmLabel}
      canConfirm={canConfirm && reason.trim().length > 0 && (!nextStep || step.trim().length > 0)}
      run={() => run(reason.trim(), step.trim())}
    >
      <p>{intro}</p>
      <Label text={reasonLabel}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
      {nextStep && (
        <Label text={<span className="font-semibold text-text">{nextStep.label}</span>}>
          <TextArea value={step} onChange={(e) => setStep(e.target.value)} rows={3} />
          <span className="block text-xs text-text-dim">{nextStep.hint}</span>
        </Label>
      )}
      {effect && <Effect>{effect}</Effect>}
    </DialogShell>
  );
}

/**
 * Record payment: ISK that reached the corporation outside the wallet journal. It shows,
 * before confirming, which days the ISK pays or part-pays, oldest first, and what is owed or
 * held after (the Miner's own Running account). When the wallet holds Unmatched donations it also offers
 * to match one of them instead: that assigns the donation to this Miner, so the same ISK is
 * never recorded twice.
 */
export function RecordPaymentDialog({
  open,
  onClose,
  miner,
  minerName,
  defaultAmount,
  paymentId,
  declarationId,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  miner: MinerRow;
  minerName: string;
  defaultAmount: number;
  /**
   * A fixed id for the hand-recorded payment, e.g. one derived from the declaration it
   * confirms: a retry, or a second officer, then finds it already recorded instead of
   * recording the ISK twice, and goes on to `onRecorded`.
   */
  paymentId?: string;
  /**
   * The Declaration this payment confirms. The server resolves it in the same write as the
   * payment or the donation match, so whichever officer lands first wins and the other is
   * refused (`already-resolved`): the ISK is never counted twice.
   */
  declarationId?: string;
  onRecorded?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { edit, names, view } = useBook();
  const k = 'corpTaxBook.moons.dialogs.record';
  const [amount, setAmount] = useState(defaultAmount >= 1 ? String(Math.round(defaultAmount)) : '');
  const [payer, setPayer] = useState(String(miner.mainCharacterId));
  const today = utcDay();
  const startDate = view.input.startDate;
  // Nothing is dated before the lock date (decision 20261120-235011, "a lock date").
  const lockDate = lockDateFor(today);
  const earliest = startDate > lockDate ? startDate : lockDate;
  const [date, setDate] = useState(today);
  // The officer's note on a payment by hand ("handed over in person"): the Miner reads it too.
  const [note, setNote] = useState('');
  const donations = useMemo(
    () =>
      view.needsYou.flatMap((n) =>
        n.kind === 'unmatched' && netPayment(n.payment) > 0 ? [n.payment] : []
      ),
    [view.needsYou]
  );
  const [mode, setMode] = useState<'hand' | 'donation'>('hand');
  const [donationId, setDonationId] = useState<string | null>(null);
  const donation = mode === 'donation' ? donations.find((d) => d.id === donationId) : undefined;
  const value = Number(amount);
  const dateError =
    date === ''
      ? t(`${k}.dateMissing`)
      : date > today
        ? t(`${k}.dateFuture`)
        : date < startDate
          ? t(`${k}.dateBeforeBook`, { date: dateWithYear(startDate) })
          : date < lockDate
            ? t(`${k}.dateLocked`, { date: dateWithYear(lockDate) })
            : null;
  const dateErrorId = useId();

  const outcome = useMemo(() => {
    if (mode === 'donation') {
      if (!donation) return undefined;
      return previewMinerPayment(view, miner.id, donation);
    }
    if (!(value > 0)) return undefined;
    return previewMinerPayment(view, miner.id, {
      id: '__preview__',
      characterId: Number(payer),
      amount: value,
      at: dateError ? new Date().toISOString() : paidAtFor(date),
      source: 'manual',
    });
  }, [mode, donation, value, payer, date, dateError, view, miner.id]);

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t(`${k}.title`, { name: minerName })}
      confirmLabel={
        mode === 'donation'
          ? t(`${k}.confirmMatch`, { amount: isk(donation ? netPayment(donation) : 0) })
          : t(`${k}.confirm`, { amount: isk(value || 0) })
      }
      canConfirm={mode === 'donation' ? donation !== undefined : value > 0 && dateError === null}
      showLogged="plain"
      run={async () => {
        if (mode === 'donation') {
          if (!donation) return;
          await edit({
            action: 'assignPayment',
            paymentId: donation.id,
            minerId: miner.id,
            ...(declarationId ? { declarationId } : {}),
          });
        } else {
          try {
            await edit({
              action: 'recordPayment',
              paymentId: paymentId ?? newId('m'),
              minerId: miner.id,
              characterId: Number(payer),
              amount: value,
              at: paidAtFor(date),
              ...(note.trim() ? { note: note.trim() } : {}),
              ...(declarationId ? { declarationId } : {}),
            });
          } catch (e) {
            // Already recorded under this fixed id: an earlier try landed, so carry on.
            if (paymentId === undefined || callableErrorReason(e) !== 'payment-exists') throw e;
          }
        }
        await onRecorded?.();
      }}
    >
      <p className="text-text-dim">{t(`${k}.intro`)}</p>
      {donations.length > 0 && (
        <Label text={t(`${k}.source`)}>
          <SegmentedControl
            label={t(`${k}.source`)}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'hand', label: t(`${k}.sourceHand`) },
              {
                value: 'donation',
                label: t(`${k}.sourceDonation`, { count: donations.length }),
              },
            ]}
            uppercase={false}
          />
        </Label>
      )}
      {mode === 'donation' ? (
        <>
          <p className="text-xs text-text-dim">{t(`${k}.matchIntro`, { name: minerName })}</p>
          <DonationPicker
            donations={donations}
            nameOf={names.character}
            value={donationId}
            onChange={setDonationId}
          />
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text={t(`${k}.amount`)}>
              <IskInput value={amount} onChange={setAmount} aria-label={t(`${k}.amount`)} />
            </Label>
            <Label text={t(`${k}.datePaid`)}>
              <TextInput
                type="date"
                value={date}
                min={earliest}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={dateError !== null}
                aria-describedby={dateError ? dateErrorId : undefined}
              />
              {dateError && (
                <FieldError id={dateErrorId} className="block text-xs">
                  {dateError}
                </FieldError>
              )}
            </Label>
          </div>
          {miner.characterIds.length > 1 && (
            <Label text={t(`${k}.paidBy`)}>
              <SegmentedControl
                label={t(`${k}.paidBy`)}
                value={payer}
                onChange={setPayer}
                options={miner.characterIds.map((id) => ({
                  value: String(id),
                  label: names.character(id),
                }))}
                uppercase={false}
              />
            </Label>
          )}
          <Label text={t(`${k}.note`)}>
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={PAYMENT_NOTE_MAX}
            />
          </Label>
        </>
      )}
      <PaymentOutcomePanel outcome={outcome} minerName={minerName} />
    </DialogShell>
  );
}

/** Mark not tax: all or part of a donation was not a tax payment (e.g. a buyback). */
export function MarkNotTaxDialog({
  open,
  onClose,
  payment,
  fromName,
}: {
  open: boolean;
  onClose: () => void;
  payment: { id: string; amount: number; at: string; notTaxAmount?: number; minerId?: string };
  fromName: string;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { edit } = useBook();
  const [mode, setMode] = useState<'all' | 'part'>('part');
  const [partial, setPartial] = useState('');
  const [reason, setReason] = useState('');
  const amount = mode === 'all' ? payment.amount : Number(partial);
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.dialogs.notTax.title')}
      confirmLabel={t('corpTaxBook.moons.dialogs.notTax.confirm', { amount: isk(amount || 0) })}
      canConfirm={amount > 0 && amount <= payment.amount}
      run={async () => {
        await edit({
          action: 'markNotTax',
          paymentId: payment.id,
          notTaxAmount: amount,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
      }}
    >
      <p>
        {t('corpTaxBook.moons.dialogs.notTax.intro', {
          name: fromName,
          amount: isk(payment.amount),
          at: dateTimeAt(payment.at, zone),
        })}
      </p>
      <div className="space-y-1">
        <span aria-hidden="true" className="block text-xs text-text-dim">
          {t('corpTaxBook.moons.dialogs.notTax.how')}
        </span>
        <SegmentedControl
          label={t('corpTaxBook.moons.dialogs.notTax.how')}
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'all',
              label: t('corpTaxBook.moons.dialogs.notTax.all'),
            },
            { value: 'part', label: t('corpTaxBook.moons.dialogs.notTax.part') },
          ]}
          uppercase={false}
        />
      </div>
      {mode === 'part' && (
        <Label text={t('corpTaxBook.moons.dialogs.notTax.amount')}>
          <IskInput
            value={partial}
            onChange={setPartial}
            aria-label={t('corpTaxBook.moons.dialogs.notTax.amount')}
          />
        </Label>
      )}
      <Label text={t('corpTaxBook.moons.dialogs.notTax.reason')}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
      <Effect>
        {payment.minerId
          ? t('corpTaxBook.moons.dialogs.notTax.effect', { amount: isk(amount || 0) })
          : amount >= payment.amount
            ? t('corpTaxBook.moons.dialogs.notTax.effectUnmatchedAll')
            : t('corpTaxBook.moons.dialogs.notTax.effectUnmatchedPart', {
                amount: isk(amount || 0),
              })}
      </Effect>
    </DialogShell>
  );
}

/**
 * A payment's row menu: move it to another Miner, or off every Miner (Unmatched), for a donation
 * the book placed wrongly (`reassignPayment`). An officer's placement stands over the book's match.
 */
export function ReassignPaymentDialog({
  open,
  onClose,
  payment,
  fromName,
  minerName,
}: {
  open: boolean;
  onClose: () => void;
  payment: { id: string; minerId: string; amount: number; at: string };
  fromName: string;
  /** Whose account it counts toward now. */
  minerName: string;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const k = 'corpTaxBook.moons.dialogs.reassign';
  const { edit } = useBook();
  const book = useBookMiners();
  const [to, setTo] = useState<'miner' | 'unmatched'>('miner');
  const [minerId, setMinerId] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  const others = book.miners.filter((m) => m.id !== payment.minerId);
  return (
    <DialogShell
      initialFocusRef={filterRef}
      open={open}
      onClose={onClose}
      title={t(`${k}.title`)}
      confirmLabel={t(to === 'miner' ? `${k}.confirm` : `${k}.confirmUnmatched`)}
      canConfirm={to === 'unmatched' || minerId !== ''}
      showLogged="plain"
      run={async () => {
        await edit({
          action: 'reassignPayment',
          paymentId: payment.id,
          minerId: to === 'miner' ? minerId : null,
        });
      }}
    >
      <p>
        {t(`${k}.intro`, {
          amount: isk(payment.amount),
          name: fromName,
          date: atDateWithYear(payment.at, zone),
          miner: minerName,
        })}
      </p>
      <SegmentedControl
        label={t(`${k}.to`)}
        value={to}
        onChange={setTo}
        options={[
          { value: 'miner', label: t(`${k}.toMiner`) },
          { value: 'unmatched', label: t(`${k}.toUnmatched`) },
        ]}
        uppercase={false}
      />
      {to === 'miner' && (
        <MinerPicker
          miners={others}
          nameOf={book.nameOf}
          value={minerId}
          onChange={setMinerId}
          filterRef={filterRef}
        />
      )}
      <Effect>{t(to === 'miner' ? `${k}.effect` : `${k}.effectUnmatched`)}</Effect>
    </DialogShell>
  );
}

/** Needs-you: link an Unmatched donation to a Miner. */
export function AssignDonationDialog({
  open,
  onClose,
  payment,
  fromName,
}: {
  open: boolean;
  onClose: () => void;
  payment: { id: string; amount: number; at: string; reason?: string };
  fromName: string;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { edit, view, names } = useBook();
  const [minerId, setMinerId] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  return (
    <DialogShell
      initialFocusRef={filterRef}
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.dialogs.assign.title')}
      confirmLabel={t('corpTaxBook.moons.dialogs.assign.confirm', { amount: isk(payment.amount) })}
      canConfirm={minerId !== ''}
      showLogged="plain"
      run={async () => {
        await edit({ action: 'assignPayment', paymentId: payment.id, minerId });
      }}
    >
      <p>
        {t('corpTaxBook.moons.dialogs.assign.intro', {
          amount: isk(payment.amount),
          name: fromName,
          date: wallClock(payment.at, zone).slice(0, 10),
          reason: payment.reason ?? '—',
        })}
      </p>
      <MinerPicker
        miners={view.miners}
        nameOf={names.character}
        value={minerId}
        onChange={setMinerId}
        filterRef={filterRef}
      />
      <Effect>{t('corpTaxBook.moons.dialogs.assign.effect')}</Effect>
    </DialogShell>
  );
}
