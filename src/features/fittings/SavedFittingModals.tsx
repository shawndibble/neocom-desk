import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import type { FittingRecord } from '@/db';
import { deleteFitting, renameFitting } from './myFittings';
import { DialogFooter } from '@/components/ui/DialogFooter';

interface SavedFittingModalProps {
  record: FittingRecord | null;
  onClose: () => void;
}

interface FittingNameModalProps {
  open: boolean;
  name: string;
  resetKey: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function FittingNameModal({
  open,
  name,
  resetKey,
  onSubmit,
  onClose,
}: FittingNameModalProps) {
  const { t } = useTranslation();
  const reasonId = useId();
  const [text, setText] = useState(name);
  const [forKey, setForKey] = useState(resetKey);
  if (resetKey !== forKey) {
    setForKey(resetKey);
    setText(name);
  }
  return (
    <Modal open={open} onClose={onClose} title={t('fittings.myFittings.confirmRename')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = text.trim();
          if (trimmed !== '') onSubmit(trimmed);
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
        <DialogFooter>
          <Button onClick={onClose}>{t('fittings.myFittings.cancel')}</Button>
          {text.trim() === '' && (
            <span id={reasonId} className="mr-auto text-[0.6875rem] text-text-dim">
              {t('fittings.myFittings.saveAsNewNeedsName')}
            </span>
          )}
          <Button
            type="submit"
            variant="primary"
            aria-disabled={text.trim() === '' || undefined}
            aria-describedby={text.trim() === '' ? reasonId : undefined}
          >
            {t('fittings.myFittings.confirmRename')}
          </Button>
        </DialogFooter>
      </form>
    </Modal>
  );
}

export function RenameFittingModal({ record, onClose }: SavedFittingModalProps) {
  return (
    <FittingNameModal
      open={record !== null}
      name={record?.name ?? ''}
      resetKey={record?.id ?? null}
      onSubmit={(name) => {
        if (record) void renameFitting(record, name);
      }}
      onClose={onClose}
    />
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
        <DialogFooter>
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
        </DialogFooter>
      </div>
    </Modal>
  );
}
