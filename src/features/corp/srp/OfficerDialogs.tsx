/**
 * The officer queue's two dialogs (issue #4853): Reject (a reason the pilot is sent) and Change
 * amount (a new figure and a reason, with the computed one kept in view). Each ends in its own
 * confirm; a refusal from the server shows inside, never as a bare toast, so the typed reason survives.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IskInput, Modal, TextArea } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import type { SrpClaim } from '../srpClaimTypes';
import { claimBasisLine, failureText } from './srpClaimText';
import { typedAmount } from './srpQueue';
import type { SrpClaimNames } from './useSrpClaimNames';

function Label({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-text-dim">{text}</span>
      {children}
    </label>
  );
}

function Shell({
  title,
  confirmLabel,
  confirmVariant,
  canConfirm,
  onClose,
  run,
  children,
}: {
  title: string;
  confirmLabel: string;
  confirmVariant: 'danger' | 'primary';
  canConfirm: boolean;
  onClose: () => void;
  run: () => Promise<void>;
  children: ReactNode;
}) {
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
      setError(failureText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const buttons = (
    <>
      <Button variant="ghost" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        variant={confirmVariant}
        loading={busy}
        aria-disabled={!canConfirm || undefined}
        onClick={canConfirm ? () => void confirm() : undefined}
      >
        {confirmLabel}
      </Button>
    </>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      placement={phone ? 'sheet' : 'center'}
      dismissOnOutsidePress={false}
      footer={
        phone ? (
          <div className="flex flex-col-reverse gap-2 [&>button]:w-full">{buttons}</div>
        ) : (
          <div className="flex justify-end gap-2">{buttons}</div>
        )
      }
    >
      <div className="space-y-3 text-sm">
        {children}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <p className="text-xs text-text-dim">{t('srp.officer.logged')}</p>
      </div>
    </Modal>
  );
}

export function RejectClaimDialog({
  claim,
  names,
  onClose,
  onReject,
}: {
  claim: SrpClaim;
  names: SrpClaimNames;
  onClose: () => void;
  onReject: (reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <Shell
      title={t('srp.officer.reject.title', { pilot: claim.characterName })}
      confirmLabel={t('srp.officer.reject.confirm')}
      confirmVariant="danger"
      canConfirm={reason.trim().length > 0}
      onClose={onClose}
      run={() => onReject(reason.trim())}
    >
      <p>
        {t('srp.officer.reject.body', {
          hull: names.hull(claim.hullTypeId),
          system: names.system(claim.solarSystemId),
          isk: formatIsk(claim.amount ?? 0),
        })}
      </p>
      <Label text={t('srp.officer.reject.reason')}>
        <TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </Label>
    </Shell>
  );
}

export function ChangeAmountDialog({
  claim,
  onClose,
  onChange,
}: {
  claim: SrpClaim;
  onClose: () => void;
  onChange: (amount: number, reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const amount = typedAmount(text);
  const computed = claim.computedAmount ?? claim.amount;
  const differs = amount !== null && amount !== claim.amount;
  return (
    <Shell
      title={t('srp.officer.change.title', { pilot: claim.characterName })}
      confirmLabel={t('srp.officer.change.confirm')}
      confirmVariant="primary"
      canConfirm={differs && reason.trim().length > 0}
      onClose={onClose}
      run={() => onChange(amount ?? 0, reason.trim())}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-text-dim">{t('srp.officer.change.computed')}</dt>
        <dd className="font-semibold tabular-nums">{formatIsk(computed ?? 0)} ISK</dd>
        <dt className="text-text-dim">{t('srp.officer.change.basis')}</dt>
        <dd>{claimBasisLine(t, claim)}</dd>
      </dl>
      <Label text={t('srp.officer.change.newAmount')}>
        <IskInput value={text} onChange={setText} aria-label={t('srp.officer.change.newAmount')} />
      </Label>
      <Label text={t('srp.officer.change.reason')}>
        <TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
        />
      </Label>
      {differs && (
        <p className="rounded-xs border border-line bg-panel-2 p-2 text-xs tabular-nums">
          {t('srp.officer.change.effect', {
            from: formatIsk(claim.amount ?? 0),
            to: formatIsk(amount),
          })}
        </p>
      )}
    </Shell>
  );
}
