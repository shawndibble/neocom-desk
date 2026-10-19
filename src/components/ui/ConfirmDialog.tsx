import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Modal } from './Modal';

/** A confirm for one action: body text, a danger or plain action, and its own failure line. */
export function ConfirmDialog({
  open,
  title,
  body,
  actionLabel,
  danger = true,
  onConfirm,
  onClose,
  returnFocusFallback,
  cancelLabel,
  failedLabel,
}: {
  open: boolean;
  title: string;
  body: string;
  actionLabel: string;
  danger?: boolean;
  /** Rejects to keep the dialog open and show the failure. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
  /** Where focus goes on close when the control that opened it is gone (`Modal`'s). */
  returnFocusFallback?: () => HTMLElement | null;
  /** Default to the Communities wording; pass your own outside Communities. */
  cancelLabel?: string;
  failedLabel?: string;
}) {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setWorking(true);
    setFailed(false);
    try {
      await onConfirm();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!working) onClose();
      }}
      title={title}
      returnFocusFallback={returnFocusFallback}
    >
      <p className="text-xs text-text-dim">{body}</p>
      {failed && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {failedLabel ?? t('communities.actionFailed')}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" disabled={working} onClick={onClose}>
          {cancelLabel ?? t('communities.cancel')}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          size="sm"
          loading={working}
          onClick={() => void confirm()}
        >
          {actionLabel}
        </Button>
      </div>
    </Modal>
  );
}
