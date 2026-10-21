import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, TextArea, TextInput } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { parseRequestedRate } from '../taxBook/feederViewModel';
import { DialogShell, Label } from './BookDialogs';

/** Set the rate a moon owner is owed (the agreed rate); it wins over the one they asked for. */
export function SetRateDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: number | null;
  onClose: () => void;
  onSave: (pct: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial === null ? '' : String(initial));
  const pct = parseRequestedRate(text);
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t('corpTaxBook.moons.moonOwners.dialogs.rate.title')}
      confirmLabel={t('corpTaxBook.moons.moonOwners.dialogs.rate.confirm')}
      canConfirm={pct !== null}
      run={async () => {
        if (pct !== null) await onSave(pct);
      }}
    >
      <Label text={t('corpTaxBook.moons.moonOwners.dialogs.rate.field')}>
        <TextInput inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </Label>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.moonOwners.dialogs.rate.hint')}</p>
    </DialogShell>
  );
}

/** Compensate a moon owner another way (fuel, rock access): a toggle and an optional note. */
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
