import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cx } from '@/lib/cx';
import { IconButton } from './IconButton';
import { Close } from './icons';

interface SlideOverProps {
  open: boolean;
  /** Escape or the close button. A click outside never closes it. */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Extra classes on the panel itself, e.g. to let the pointer through while something drags out of it. */
  className?: string;
}

/**
 * A non-modal panel that slides over the right edge of the page, on Radix's
 * `Dialog` with `modal={false}` (docs/adr/0008) for its Escape handling,
 * focus management and labelling.
 *
 * Unlike `Modal`, the page behind stays live: nothing goes inert, there is
 * no backdrop, and a click outside is not a dismissal — so the page can keep
 * steering what the panel shows (the Fitting editor retargets its Add panel
 * from the Ring behind it) and take drops dragged out of it.
 */
export function SlideOver({ open, onClose, title, children, className }: SlideOverProps) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onInteractOutside={(event) => event.preventDefault()}
          aria-describedby={undefined}
          className={cx(
            'fixed top-0 right-0 bottom-0 z-40 flex w-full max-w-[25rem] flex-col border-l border-line-bright bg-panel shadow-2xl',
            className
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
            <IconButton icon={<Close />} label={t('common.close')} onClick={onClose} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
