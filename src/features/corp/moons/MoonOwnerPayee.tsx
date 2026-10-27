import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { PayeeNameField } from '@/features/miningTax/PayeeNameField';
import type { PayeeEntityMatch } from '@/features/miningTax/payeeEntitySearch';
import type { Payee } from '@/engine/corpTaxBook/payouts';
import { DialogShell } from './BookDialogs';
import { shortDate } from './moonsFormat';
import { OwnerStatusStrip } from './OwnerStatusStrip';
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';

const k = (key: string) => `corpTaxBook.moons.ownerView.payee.${key}`;

/**
 * "Who gets paid" on the moon owner's page, with Change for its officers. `setBy` says
 * which side set it and when; absent for a payee set before that was kept.
 */
export function PayeeLine({
  name,
  setBy,
  onChange,
}: {
  name: string;
  /** The accounting corporation's name, or null for this side. */
  setBy?: { name: string | null; at: number };
  onChange?: () => void;
}) {
  const { t } = useTranslation();
  const date = setBy ? shortDate(new Date(setBy.at).toISOString()) : '';
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

/**
 * Pick who the moon owner is paid as: a corporation or a player from the name
 * search. Only a picked one saves; an alliance cannot be paid.
 */
export function ChangePayeeDialog({
  characterId,
  onClose,
  onSave,
}: {
  /** Whose token the name search runs under. */
  characterId: number;
  onClose: () => void;
  /** The picked payee and its name, for the mail to the other side. */
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

/**
 * The other side changed the payee (#4653): one strip on the page until an officer dismisses it
 * on this device. A later change shows again. Never says anything about timing.
 */
export function PayeeChangeStrip({
  storageKey,
  at,
  payeeName,
  byName,
}: {
  /** Which moon owner and book: one dismissal per page. */
  storageKey: string;
  /** When it changed (ms). */
  at: number;
  payeeName: string;
  /** The corporation whose officer changed it. */
  byName: string;
}) {
  const { t } = useTranslation();
  // Read every render: the same strip may be handed another page's key.
  const [dismissedNow, setDismissedNow] = useState<string | null>(null);
  const seen = `${storageKey}:${at}`;
  if (dismissedNow === seen || readLocal(DISMISSED + storageKey) === String(at)) return null;
  const dismiss = () => {
    // Blocked storage: dismissed for this visit only.
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
        date: shortDate(new Date(at).toISOString()),
      })}
      actions={
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {t('corpTaxBook.moons.payeeNotice.dismiss')}
        </Button>
      }
    />
  );
}
