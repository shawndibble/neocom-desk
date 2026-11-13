/**
 * The Corp Tax Book's officer dialogs (#4056 steps 5-9, #4063): every one is a
 * `Modal` (a sheet on a phone) that says who it is logged as, runs one edit
 * through `useBook().edit` (`editBook`, role re-checked live on the server)
 * and shows the refusal's mapped reason when it refuses.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FieldError,
  IskInput,
  Modal,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
  TextInput,
} from '@/components/ui';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { previewMinerPayment } from '@/engine/corpTaxBook/paymentPreview';
import { utcDay } from '@/engine/localDay';
import { useIsPhone } from '@/lib/useIsPhone';
import { callableErrorText } from './feederErrorText';
import { useBook } from './useBook';
import { dateWithYear, isk, newId, paidAtFor } from './moonsFormat';
import { DonationPicker, PaymentOutcomePanel } from './RecordPaymentParts';

export function Label({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-text-dim">{text}</span>
      {children}
    </label>
  );
}

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
      placement={phone ? 'sheet' : 'center'}
      footer={
        <div className="flex justify-end gap-2">
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
        </div>
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
    <p className="rounded-xs border border-line bg-panel-2 p-2 text-xs tabular-nums">{children}</p>
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
  run,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: ReactNode;
  reasonLabel: string;
  confirmLabel: string;
  effect?: ReactNode;
  run: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      confirmLabel={confirmLabel}
      canConfirm={reason.trim().length > 0}
      run={() => run(reason.trim())}
    >
      <p>{intro}</p>
      <Label text={reasonLabel}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Label>
      {effect && <Effect>{effect}</Effect>}
    </DialogShell>
  );
}

/**
 * Record payment: ISK that reached the corporation outside the wallet journal. It shows,
 * before confirming, which Statements the ISK clears or part-pays and what is owed or held
 * after (the book's own allocation). When the wallet holds Unmatched donations it also offers
 * to match one of them instead: that assigns the donation to this Miner, so the same ISK is
 * never recorded twice.
 */
export function RecordPaymentDialog({
  open,
  onClose,
  miner,
  minerName,
  defaultAmount,
  statementId,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  miner: MinerRow;
  minerName: string;
  defaultAmount: number;
  /** Credit this Statement first (a payment code would do the same). */
  statementId?: string;
  onRecorded?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { edit, names, view } = useBook();
  const k = 'corpTaxBook.moons.dialogs.record';
  const [amount, setAmount] = useState(defaultAmount >= 1 ? String(Math.round(defaultAmount)) : '');
  const [payer, setPayer] = useState(String(miner.mainCharacterId));
  const today = utcDay();
  const startDate = view.input.startDate;
  const [date, setDate] = useState(today);
  const donations = useMemo(
    () =>
      view.needsYou.flatMap((n) =>
        n.kind === 'unmatched' && (n.payment.notTaxAmount ?? 0) < n.payment.amount
          ? [n.payment]
          : []
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
      ...(statementId ? { statementId } : {}),
    });
  }, [mode, donation, value, payer, date, dateError, statementId, view, miner.id]);
  const statements = view.internals.byMiner.get(miner.id)?.statements ?? [];

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t(`${k}.title`, { name: minerName })}
      confirmLabel={
        mode === 'donation'
          ? t(`${k}.confirmMatch`, { amount: isk(donation?.amount ?? 0) })
          : t(`${k}.confirm`, { amount: isk(value || 0) })
      }
      canConfirm={mode === 'donation' ? donation !== undefined : value > 0 && dateError === null}
      showLogged="plain"
      run={async () => {
        if (mode === 'donation') {
          if (!donation) return;
          await edit({ action: 'assignPayment', paymentId: donation.id, minerId: miner.id });
        } else {
          await edit({
            action: 'recordPayment',
            paymentId: newId('m'),
            minerId: miner.id,
            characterId: Number(payer),
            amount: value,
            at: paidAtFor(date),
            ...(statementId ? { statementId } : {}),
          });
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
                min={startDate}
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
        </>
      )}
      <PaymentOutcomePanel outcome={outcome} statements={statements} minerName={minerName} />
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
  payment: { id: string; amount: number; at: string; notTaxAmount?: number };
  fromName: string;
}) {
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
      canConfirm={amount > 0 && amount <= payment.amount && reason.trim().length > 0}
      run={async () => {
        await edit({
          action: 'markNotTax',
          paymentId: payment.id,
          notTaxAmount: amount,
          reason: reason.trim(),
        });
      }}
    >
      <p>
        {t('corpTaxBook.moons.dialogs.notTax.intro', {
          name: fromName,
          amount: isk(payment.amount),
          at: payment.at.slice(0, 16).replace('T', ' '),
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
      <Effect>{t('corpTaxBook.moons.dialogs.notTax.effect', { amount: isk(amount || 0) })}</Effect>
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
  const { t } = useTranslation();
  const { edit, view, names } = useBook();
  const [minerId, setMinerId] = useState('');
  return (
    <DialogShell
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
          date: payment.at.slice(0, 10),
          reason: payment.reason ?? '—',
        })}
      </p>
      <Label text={t('corpTaxBook.moons.dialogs.assign.miner')}>
        <Select value={minerId} onValueChange={setMinerId}>
          <SelectTrigger
            aria-label={t('corpTaxBook.moons.dialogs.assign.miner')}
            className="w-full"
          >
            <SelectValue placeholder={t('corpTaxBook.moons.dialogs.assign.pick')} />
          </SelectTrigger>
          <SelectContent>
            {view.miners.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {names.character(m.mainCharacterId)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <Effect>{t('corpTaxBook.moons.dialogs.assign.effect')}</Effect>
    </DialogShell>
  );
}
