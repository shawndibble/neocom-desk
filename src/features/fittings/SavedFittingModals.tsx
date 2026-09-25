import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import type { FittingRecord } from '@/db';
import { deleteFitting, renameFitting } from './myFittings';

interface SavedFittingModalProps {
  /** The saved Fitting acted on; the dialog is open while this is set. */
  record: FittingRecord | null;
  onClose: () => void;
}

export function RenameFittingModal({ record, onClose }: SavedFittingModalProps) {
  const { t } = useTranslation();
  // Reset to the record's name each time a different one opens, during render.
  const [text, setText] = useState(record?.name ?? '');
  const [forId, setForId] = useState(record?.id ?? null);
  if ((record?.id ?? null) !== forId) {
    setForId(record?.id ?? null);
    setText(record?.name ?? '');
  }
  return (
    <Modal open={record !== null} onClose={onClose} title={t('fittings.myFittings.confirmRename')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const name = text.trim();
          if (record && name !== '') void renameFitting(record, name);
          onClose();
        }}
      >
        <label className="block text-xs text-text-dim" htmlFor="my-fitting-rename">
          {t('fittings.myFittings.renameLabel')}
        </label>
        <TextInput
          id="my-fitting-rename"
          className="w-full"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('fittings.myFittings.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={text.trim() === ''}>
            {t('fittings.myFittings.confirmRename')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteFittingModal({ record, onClose }: SavedFittingModalProps) {
  const { t } = useTranslation();
  return (
    <Modal open={record !== null} onClose={onClose} title={t('fittings.myFittings.confirmDelete')}>
      <div className="space-y-3">
        <p className="text-sm text-text">
          {t('fittings.myFittings.deleteConfirm', { name: record?.name ?? '' })}
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('fittings.myFittings.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (record) void deleteFitting(record);
              onClose();
            }}
          >
            {t('fittings.myFittings.confirmDelete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
