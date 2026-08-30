import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type ModalPlacement = 'center' | 'sheet';

interface ModalProps {
  /** Parent owns the state; the modal never closes itself. */
  open: boolean;
  /** Id on the `<dialog>` itself, for a trigger's `aria-controls`. */
  id?: string;
  /** Requested close — Escape, backdrop click, or the header close button. */
  onClose: () => void;
  /** Visible heading and the dialog's accessible name. */
  title: string;
  children: ReactNode;
  /** `center` for dialogs, `sheet` for a bottom-anchored mobile drawer. */
  placement?: ModalPlacement;
}

/**
 * Modal on the native `<dialog>` (`showModal()`), which supplies what a
 * `role="dialog" aria-modal="true"` div only *claims* to have: top-layer
 * placement, an inert background, focus moved in on open, Escape firing
 * `cancel`. No hand-rolled focus trap — platform inertness is correct and free.
 *
 * Dismissal is uniform across every call site: Escape closes, backdrop click
 * closes. The `<dialog>` *is* the surface (docs/DESIGN.md §5 sanctions shadows
 * for modals), and stays content-sized rather than viewport-filling — otherwise
 * it would cover its own `::backdrop`.
 */
export function Modal({ open, id, onClose, title, children, placement = 'center' }: ModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    // Native `<dialog>` restores focus on close, but only to the element
    // focused at showModal() time; capture it so the guarantee holds under
    // unmount-while-open too.
    const trigger = document.activeElement;
    if (!dialog.open) dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open]);

  const placementClass =
    placement === 'sheet'
      ? 'mx-auto mt-auto mb-0 max-h-[85vh] w-full max-w-md rounded-b-none'
      : 'm-auto max-h-[85vh] w-full max-w-lg';

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // preventDefault so the browser never closes behind React's back:
        // every close path routes through `onClose` and the parent's `open`,
        // which the effect turns into dialog.close().
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // With `p-0`, the only clicks whose target is the dialog element are
        // ones that landed on its ::backdrop.
        if (event.target === dialogRef.current) onClose();
      }}
      className={`fixed inset-0 h-fit overflow-hidden rounded-xs border border-line bg-panel p-0 text-text shadow-lg shadow-black/50 backdrop:bg-black/60 ${placementClass}`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex min-h-8 items-center justify-between gap-2 border-b border-line px-3 py-1">
            <h2
              id={titleId}
              className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="rounded-xs px-1.5 py-0.5 text-text-dim transition-colors hover:bg-panel-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
        </div>
      )}
    </dialog>
  );
}
