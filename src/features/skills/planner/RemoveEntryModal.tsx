import { romanLevel } from '@/engine/projection';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { firstConnected, type FocusCandidate } from '@/lib/useFocusAfterCommit';

interface RemoveEntryModalProps {
  /** The row awaiting confirmation; null while closed. Skill *and* level: a plan holds one entry per level. */
  removing: { skillTypeID: number; targetLevel: number } | null;
  nameFor: (skillTypeID: number) => string;
  /** Where focus lands if the opener is gone by the time the dialog closes (WCAG 2.4.3). */
  focusRef: RefObject<readonly FocusCandidate[]>;
  onClose: () => void;
  onConfirm: () => void;
}

/** Remove-entry confirmation (#408) — an in-app Modal rather than removing on click, like PlanList's delete. */
export function RemoveEntryModal({
  removing,
  nameFor,
  focusRef,
  onClose,
  onConfirm,
}: RemoveEntryModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      open={removing !== null}
      onClose={onClose}
      title={t('plans.removeEntryConfirmTitle')}
      returnFocusFallback={() => firstConnected(focusRef.current)}
    >
      <p className="text-xs text-text-dim">
        {t('plans.removeEntryConfirm', {
          name:
            removing === null
              ? ''
              : `${nameFor(removing.skillTypeID)} ${romanLevel(removing.targetLevel)}`,
        })}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" onClick={onClose}>
          {t('plans.cancel')}
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm}>
          {t('plans.removeEntryAction')}
        </Button>
      </div>
    </Modal>
  );
}
