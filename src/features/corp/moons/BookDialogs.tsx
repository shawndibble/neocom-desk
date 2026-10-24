/**
 * The Corp Tax Book's officer dialogs (#4056 steps 5-9, #4063): every one is a
 * `Modal` (a sheet on a phone) that says who it is logged as, runs one edit
 * through `useBook().edit` (`editBook`, role re-checked live on the server)
 * and shows the refusal's mapped reason when it refuses.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IskInput,
  Modal,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
} from '@/components/ui';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { useIsPhone } from '@/lib/useIsPhone';
import { callableErrorText } from './feederErrorText';
import { useBook } from './useBook';
import { isk, newId } from './moonsFormat';

export function Label({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-text-dim">{text}</span>
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
  /** The "logged under your name" footer note; off where no reason is asked. */
  showLogged?: boolean;
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
          <p className="text-xs text-text-dim">{t('corpTaxBook.moons.dialogs.logged')}</p>
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

/** Record payment: ISK that reached the corporation outside the wallet journal. */
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
  statementId?: string;
  onRecorded?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { edit, names } = useBook();
  const [amount, setAmount] = useState(String(Math.round(defaultAmount)));
  const [payer, setPayer] = useState(String(miner.mainCharacterId));
  const [note, setNote] = useState('');
  const value = Number(amount);
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.dialogs.record.title', { name: minerName })}
      confirmLabel={t('corpTaxBook.moons.dialogs.record.confirm', { amount: isk(value || 0) })}
      canConfirm={value > 0 && note.trim().length > 0}
      run={async () => {
        await edit({
          action: 'recordPayment',
          paymentId: newId('m'),
          minerId: miner.id,
          characterId: Number(payer),
          amount: value,
          at: new Date().toISOString(),
          note: note.trim(),
          ...(statementId ? { statementId } : {}),
        });
        await onRecorded?.();
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.dialogs.record.intro')}</p>
      <Label text={t('corpTaxBook.moons.dialogs.record.amount')}>
        <IskInput
          value={amount}
          onChange={setAmount}
          aria-label={t('corpTaxBook.moons.dialogs.record.amount')}
        />
      </Label>
      {miner.characterIds.length > 1 && (
        <Label text={t('corpTaxBook.moons.dialogs.record.paidBy')}>
          <SegmentedControl
            label={t('corpTaxBook.moons.dialogs.record.paidBy')}
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
      <Label text={t('corpTaxBook.moons.dialogs.record.note')}>
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Label>
      <Effect>{t('corpTaxBook.moons.dialogs.record.effect', { name: minerName })}</Effect>
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
      <Label text={t('corpTaxBook.moons.dialogs.notTax.how')}>
        <SegmentedControl
          label={t('corpTaxBook.moons.dialogs.notTax.how')}
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'all',
              label: t('corpTaxBook.moons.dialogs.notTax.all', { amount: isk(payment.amount) }),
            },
            { value: 'part', label: t('corpTaxBook.moons.dialogs.notTax.part') },
          ]}
          uppercase={false}
        />
      </Label>
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
