import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { PayeeNameField } from '@/features/miningTax/PayeeNameField';
import type { PayeeEntityMatch } from '@/features/miningTax/payeeEntitySearch';
import type { FeederPayee } from '../taxBook/feederViewClient';
import { DialogShell } from './BookDialogs';

const k = (key: string) => `corpTaxBook.moons.ownerView.payee.${key}`;

/** "Who gets paid" on the moon owner's page, with Change… for its officers. */
export function PayeeLine({ name, onChange }: { name: string; onChange?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-sm">
      <p>{t(k('line'), { name })}</p>
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
  onSave: (payee: FeederPayee) => Promise<void>;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<PayeeEntityMatch | null>(null);
  const pickedAlliance = picked?.kind === 'alliance';
  const payee: FeederPayee | null =
    picked && picked.kind !== 'alliance' ? { kind: picked.kind, id: picked.id } : null;
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t(k('dialogTitle'))}
      confirmLabel={t(k('confirm'))}
      canConfirm={payee !== null}
      run={async () => {
        if (payee) await onSave(payee);
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
