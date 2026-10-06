import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cx } from '@/lib/cx';
import { useOverlayHistory } from '@/lib/useOverlayHistory';
import { IconButton } from './IconButton';
import { Close } from './icons';
import { RowTappableContext } from './tooltipHold';

interface SlideOverProps {
  open: boolean;
  /** Escape or the close button. A click outside never closes it. */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Which edge it slides over. */
  side?: 'left' | 'right';
  /** Extra classes on the panel itself, e.g. an offset to clear a sidebar. */
  className?: string;
  /** As `Modal`'s: `false` only for a panel a URL already backs, or Back is pushed twice. */
  closeOnBack?: boolean;
}

const SIDE_CLASS = {
  left: 'left-0 border-r',
  right: 'right-0 border-l',
} as const;

/**
 * A non-modal panel that slides over one edge of the page, on Radix's
 * `Dialog` with `modal={false}` (docs/adr/0008) for its Escape handling,
 * focus management and labelling.
 *
 * Unlike `Modal`, the page behind stays live: nothing goes inert, there is
 * no backdrop, and a click outside is not a dismissal — so the page can keep
 * steering what the panel shows (the Fitting editor retargets its Add panel
 * from the Ring behind it) and take drops dragged out of it.
 *
 * Escape, the close button and Back all close it; `env(safe-area-inset-bottom)`
 * keeps its last row clear of a phone's home indicator.
 */
export function SlideOver({
  open,
  onClose,
  title,
  children,
  side = 'right',
  className,
  closeOnBack = true,
}: SlideOverProps) {
  const { t } = useTranslation();
  // Back closes it, like every other overlay (§6c).
  useOverlayHistory(open, onClose, closeOnBack);
  // Radix has no Trigger here, so it cannot return focus on close: remember
  // what held focus as the panel opened and give it back.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);
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
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            // Focus the panel, not its first control: the Close button's
            // tooltip would otherwise open on this programmatic focus and eat
            // the first Escape. The dialog's title is announced instead.
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            // The opener may be gone (a recycled list row): then leave Radix's default.
            const target = opener.current;
            opener.current = null;
            if (!target?.isConnected) return;
            event.preventDefault();
            target.focus({ preventScroll: true });
          }}
          className={cx(
            'outline-none fixed top-0 bottom-0 z-40 flex w-full max-w-[25rem] flex-col pb-[env(safe-area-inset-bottom)] border-line-bright bg-panel shadow-lg shadow-black/50',
            SIDE_CLASS[side],
            className
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
            <IconButton icon={<Close />} label={t('common.close')} onClick={onClose} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <RowTappableContext.Provider value={false}>{children}</RowTappableContext.Provider>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
