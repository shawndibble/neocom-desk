import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, TextArea, TextInput } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { parseRequestedRate } from '../taxBook/feederViewModel';
import { MAX_AS_OF_DAYS_BACK } from '@/engine/corpTaxBook/ownerRate';
import { DialogShell, Label } from './BookDialogs';

export function SetRateDialog({
  initial,
  today,
  earliest,
  onClose,
  onSave,
}: {
  initial: number | null;
  today: string;
  earliest: string;
  onClose: () => void;
  onSave: (pct: number, asOf: string | undefined) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial === null ? '' : String(initial));
  const [asOf, setAsOf] = useState(today);
  const pct = parseRequestedRate(text);
  const asOfOk = asOf >= earliest && asOf <= today;
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t('corpTaxBook.moons.moonOwners.dialogs.rate.title')}
      confirmLabel={t('corpTaxBook.moons.moonOwners.dialogs.rate.confirm')}
      canConfirm={pct !== null && asOfOk}
      run={async () => {
        if (pct !== null) await onSave(pct, asOf === today ? undefined : asOf);
      }}
    >
      <Label text={t('corpTaxBook.moons.moonOwners.dialogs.rate.field')}>
        <TextInput inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </Label>
      <Label text={t('corpTaxBook.moons.moonOwners.dialogs.rate.asOf')}>
        <TextInput
          type="date"
          value={asOf}
          min={earliest}
          max={today}
          aria-invalid={!asOfOk}
          onChange={(e) => setAsOf(e.target.value)}
        />
      </Label>
      <p className="text-xs text-text-dim">
        {t('corpTaxBook.moons.moonOwners.dialogs.rate.hint', { days: MAX_AS_OF_DAYS_BACK })}
      </p>
    </DialogShell>
  );
}

export function SettledOtherwiseDialog({
  initialOn,
  initialNote,
  onClose,
  onSave,
}: {
  initialOn: boolean;
  initialNote: string;
  onClose: () => void;
  onSave: (on: boolean, note: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [on, setOn] = useState(initialOn);
  const [note, setNote] = useState(initialNote);
  const k = (key: string) => `corpTaxBook.moons.moonOwners.dialogs.settled.${key}`;
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t(k('title'))}
      confirmLabel={t(k('confirm'))}
      canConfirm={on !== initialOn || (on && note.trim() !== initialNote.trim())}
      run={() => onSave(on, note.trim())}
    >
      <label className={touchCheckboxLabelClassName}>
        <Checkbox checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span>{t(k('toggle'))}</span>
      </label>
      {on && (
        <Label text={t(k('note'))}>
          <TextArea
            rows={2}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Label>
      )}
      <p className="text-xs text-text-dim">{t(on ? k('onHint') : k('offHint'))}</p>
    </DialogShell>
  );
}

export function RemoveMoonOwnerDialog({
  ownerName,
  accountingName,
  hasPayee,
  onClose,
  onStart,
}: {
  ownerName: string;
  accountingName: string;
  hasPayee: boolean;
  onClose: () => void;
  onStart: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const k = (key: string) => `corpTaxBook.moons.moonOwners.dialogs.remove.${key}`;
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t(k('title'), { name: ownerName })}
      confirmLabel={t(k('confirm'))}
      canConfirm
      danger
      run={onStart}
    >
      <p>{t(k('body'), { accounting: accountingName })}</p>
      <div className="space-y-1 rounded-xs border border-line p-3">
        <p className="text-xs text-text-dim">{t(k('mailTo'))}</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>{t(k('officers'), { accounting: accountingName })}</li>
          <li>{t(k('ceo'), { name: ownerName })}</li>
          {hasPayee && <li>{t(k('payee'), { name: ownerName })}</li>}
        </ul>
      </div>
      <p className="text-xs text-text-dim">{t(k('kept'))}</p>
      <p className="text-xs text-text-dim">{t(k('mailNote'))}</p>
    </DialogShell>
  );
}
