import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Modal } from './Modal';
import { DialogFooter } from './DialogFooter';

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
  closeOnBack,
  children,
}: {
  open: boolean;
  title: string;
  body: string;
  actionLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  returnFocusFallback?: () => HTMLElement | null;
  cancelLabel?: string;
  failedLabel?: string;
  closeOnBack?: boolean;
  children?: ReactNode;
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
      closeOnBack={closeOnBack}
      sheetOnPhone={false}
    >
      <p className="text-xs text-text-dim">{body}</p>
      {children}
      {failed && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {failedLabel ?? t('communities.actionFailed')}
        </p>
      )}
      <DialogFooter className="mt-3">
        <Button disabled={working} onClick={onClose}>
          {cancelLabel ?? t('communities.cancel')}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          loading={working}
          onClick={() => void confirm()}
        >
          {actionLabel}
        </Button>
      </DialogFooter>
    </Modal>
  );
}
