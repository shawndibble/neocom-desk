/**
 * Plan Milestone (CONTEXT.md) naming modal: the one small form shared by
 * "Add milestone…" and "Rename" — seeded with the existing name on rename,
 * blank on add. One instance is reused across every row (PlanEditor holds a
 * single `milestoneModal` state), so re-seeding on every open transition
 * matters — otherwise a second row would inherit whatever the first one was
 * mid-typing.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';

interface MilestoneModalProps {
  open: boolean;
  /** Present only when renaming — seeds the field and switches the title/save copy. */
  initialName?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

export function MilestoneModal({ open, initialName, onClose, onSave }: MilestoneModalProps) {
  const { t } = useTranslation();
  const isRename = initialName !== undefined;
  const [draft, setDraft] = useState(initialName ?? '');
  // Adjusted during render (react.dev "Adjusting state when a prop changes"),
  // like RemapMarkerModal's own `wasOpen` — an effect would commit the stale
  // draft for one frame first, and calling setState synchronously inside an
  // effect body is exactly what triggers React's cascading-render warning.
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
      title={isRename ? t('plans.milestone.renameTitle') : t('plans.milestone.addTitle')}
    >
      <div className="space-y-3 text-xs">
        <TextInput
          autoFocus
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
          <Button variant="primary" size="sm" onClick={save} disabled={draft.trim() === ''}>
            {t('plans.milestone.save')}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('plans.milestone.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
