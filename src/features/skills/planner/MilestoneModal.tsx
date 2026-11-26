import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput, Tooltip } from '@/components/ui';

interface MilestoneModalProps {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

export function MilestoneModal({ open, initialName, onClose, onSave }: MilestoneModalProps) {
  const { t } = useTranslation();
  const isRename = initialName !== undefined;
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialName ?? '');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initialName ?? '');
  }

  function save() {
    const name = draft.trim();
    if (!name) return;
    onSave(name);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      initialFocusRef={nameRef}
      title={isRename ? t('plans.milestone.renameTitle') : t('plans.milestone.addTitle')}
    >
      <div className="space-y-3 text-xs">
        <TextInput
          ref={nameRef}
          size="sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('plans.milestone.namePlaceholder')}
          aria-label={t('plans.milestone.namePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <div className="flex gap-2">
          <Tooltip content={draft.trim() === '' ? t('plans.milestone.saveNeedsName') : null}>
            <Button
              variant="primary"
              size="sm"
              onClick={save}
              aria-disabled={draft.trim() === '' || undefined}
            >
              {t('plans.milestone.save')}
            </Button>
          </Tooltip>
          <Button size="sm" onClick={onClose}>
            {t('plans.milestone.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
