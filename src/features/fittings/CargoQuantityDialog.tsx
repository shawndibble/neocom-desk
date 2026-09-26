/**
 * A cargo item's "Change quantity…": how many of it the hold carries, 0
 * taking it out. Mounted per item opened, so the field starts at that
 * item's own count.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';

interface CargoQuantityDialogProps {
  name: string;
  /** What the hold carries now — where the field starts. */
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
  return (
    <Modal open onClose={onClose} title={t('fittings.item.quantityTitle', { name })}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const next = Math.floor(Number(draft));
          if (!Number.isFinite(next) || next < 0) return;
          onConfirm(next);
        }}
      >
        <label className="block text-xs text-text-dim" htmlFor="fitting-cargo-quantity">
          {t('fittings.edit.quantity')}
        </label>
        <TextInput
          id="fitting-cargo-quantity"
          type="number"
          min={0}
          className="w-full"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('fittings.myFittings.cancel')}</Button>
          <Button type="submit" variant="primary">
            {t('fittings.item.quantityConfirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
