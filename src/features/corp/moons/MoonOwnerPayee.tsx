import { useId, useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { PayeeNameField } from '@/features/miningTax/PayeeNameField';
import type { PayeeEntityMatch } from '@/features/miningTax/payeeEntitySearch';
import type { Payee } from '@/engine/corpTaxBook/payouts';
import { DialogShell } from './BookDialogs';
import { atDate } from './moonsFormat';
import { OwnerStatusStrip } from './OwnerStatusStrip';
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';

const k = (key: string) => `corpTaxBook.moons.ownerView.payee.${key}`;

export function PayeeLine({
  name,
  setBy,
  onChange,
}: {
  name: string;
  setBy?: { name: string | null; at: number };
  onChange?: () => void;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const date = setBy ? atDate(setBy.at, zone) : '';
  return (
    <div className="space-y-1 text-sm">
      <p>
        {t(k('line'), { name })}
        {setBy && (
          <>
            {' · '}
            <span className="text-text-dim">
              {setBy.name === null
                ? t(k('setByYou'), { date })
                : t(k('setBy'), { name: setBy.name, date })}
            </span>
          </>
        )}
      </p>
      {onChange && (
        <Button size="sm" aria-label={t(k('changeLabel'))} onClick={onChange}>
          {t(k('change'))}
        </Button>
      )}
    </div>
  );
}

export function ChangePayeeDialog({
  characterId,
  onClose,
  onSave,
}: {
  characterId: number;
  onClose: () => void;
  onSave: (payee: Payee, name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<PayeeEntityMatch | null>(null);
  const pickedAlliance = picked?.kind === 'alliance';
  const payee: Payee | null =
    picked && picked.kind !== 'alliance' ? { kind: picked.kind, id: picked.id } : null;
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t(k('dialogTitle'))}
      confirmLabel={t(k('confirm'))}
      canConfirm={payee !== null}
      run={async () => {
        if (payee && picked) await onSave(payee, picked.name);
      }}
    >
      <div className="space-y-1">
        <label htmlFor={fieldId} className="block text-xs text-text-dim">
          {t(k('field'))}
        </label>
        <PayeeNameField
          id={fieldId}
          characterId={characterId}
          value={text}
          onChange={(name) => {
            setText(name);
            setPicked(null);
          }}
          onPick={(match) => {
            setText(match.name);
            setPicked(match);
          }}
        />
      </div>
      {pickedAlliance ? (
        <p role="alert" className="text-xs text-warning">
          {t(k('alliance'))}
        </p>
      ) : (
        <p className="text-xs text-text-dim">{t(k('hint'))}</p>
      )}
    </DialogShell>
  );
}

const DISMISSED = 'neocom-desk.payeeNotice.';

export function PayeeChangeStrip({
  storageKey,
  at,
  payeeName,
  byName,
}: {
  storageKey: string;
  at: number;
  payeeName: string;
  byName: string;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const [dismissedNow, setDismissedNow] = useState<string | null>(null);
  const seen = `${storageKey}:${at}`;
  if (dismissedNow === seen || readLocal(DISMISSED + storageKey) === String(at)) return null;
  const dismiss = () => {
    writeLocal(DISMISSED + storageKey, String(at));
    setDismissedNow(seen);
  };
  return (
    <OwnerStatusStrip
      tone="neutral"
      title={t('corpTaxBook.moons.payeeNotice.title')}
      body={t('corpTaxBook.moons.payeeNotice.body', {
        payee: payeeName,
        by: byName,
        date: atDate(at, zone),
      })}
      actions={
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {t('corpTaxBook.moons.payeeNotice.dismiss')}
        </Button>
      }
    />
  );
}
