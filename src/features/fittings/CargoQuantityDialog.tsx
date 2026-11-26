import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FieldError, Modal, TextInput } from '@/components/ui';
import { DialogFooter } from '@/components/ui/DialogFooter';
import { parseLocalizedNumber } from '@/engine/numbers/parseLocalizedNumber';

function parseCount(text: string): number | null {
  const value = parseLocalizedNumber(text);
  return value !== null && Number.isInteger(value) && value >= 0 ? value : null;
}

interface CargoQuantityDialogProps {
  name: string;
  quantity: number;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}

export function CargoQuantityDialog({
  name,
  quantity,
  onClose,
  onConfirm,
}: CargoQuantityDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(quantity));
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('fittings.item.quantityTitle', { name })}
      initialFocusRef={fieldRef}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const next = parseCount(draft);
          if (next === null) {
            setInvalid(true);
            return;
          }
          onConfirm(next);
        }}
      >
        <label className="block text-xs text-text-dim" htmlFor="fitting-cargo-quantity">
          {t('fittings.edit.quantity')}
        </label>
        <TextInput
          ref={fieldRef}
          id="fitting-cargo-quantity"
          inputMode="numeric"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className="w-full"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
        {invalid && <FieldError id={errorId}>{t('fittings.item.quantityInvalid')}</FieldError>}
        <DialogFooter>
          <Button onClick={onClose}>{t('fittings.myFittings.cancel')}</Button>
          <Button type="submit" variant="primary">
            {t('fittings.item.quantityConfirm')}
          </Button>
        </DialogFooter>
      </form>
    </Modal>
  );
}
