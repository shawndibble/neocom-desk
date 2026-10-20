import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';

interface SaveAsNewDialogProps {
  open: boolean;
  onClose: () => void;
  name: string;
  onNameChange: (name: string) => void;
  /** Called with the trimmed, non-empty name; the dialog closes itself after. */
  onConfirm: (name: string) => void;
}

/** "Save as new…": names the copy of the open Fitting. */
export function SaveAsNewDialog({
  open,
  onClose,
  name,
  onNameChange,
  onConfirm,
}: SaveAsNewDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('fittings.myFittings.saveAsNewTitle')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed === '') return;
          onConfirm(trimmed);
          onClose();
        }}
      >
        <label className="block text-xs text-text-dim" htmlFor="fitting-save-as-new-name">
          {t('fittings.myFittings.saveAsNewLabel')}
        </label>
        <TextInput
          id="fitting-save-as-new-name"
          className="w-full"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('fittings.myFittings.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={name.trim() === ''}>
            {t('fittings.myFittings.saveAsNewConfirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
