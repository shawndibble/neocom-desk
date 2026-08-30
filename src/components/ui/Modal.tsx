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
  /** Extra classes on the `<dialog>` itself (sizing, responsive visibility). */
  className?: string;
}

/**
 * Modal dialog on the native `<dialog>` element (`showModal()`), which is
 * Baseline widely available since March 2022. It supplies the things a
 * `role="dialog" aria-modal="true"` `<div>` only *claims* to have: top-layer
 * placement, an inert background, focus moved into the dialog on open, and
 * Escape firing `cancel`. Nothing here hand-rolls a focus trap — the platform's
 * inertness is both correct and free.
 *
 * Dismissal is uniform across every call site: **Escape closes and a backdrop
 * click closes.** Escape arrives as a `cancel` event, which is preventDefault-ed
 * so the browser never closes the dialog behind React's back — every close path
 * routes through `onClose` and the parent's `open` flag.
 *
 * The `<dialog>` *is* the surface (panel fill, hairline, `rounded-xs`, shadow —
 * §5 sanctions shadows for popovers and modals). It must stay content-sized
 * rather than viewport-filling, otherwise it covers its own `::backdrop`; that
 * also makes the backdrop-click test exact, since with `p-0` on the dialog the
 * only clicks that target it are backdrop clicks.
 */
export function Modal({
  open,
  id,
  onClose,
  title,
  children,
  placement = 'center',
  className = '',
}: ModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    // Native `<dialog>` restores focus on close in modern browsers, but only
    // for the element focused at showModal() time; capture it explicitly so the
    // guarantee holds under unmount-while-open too.
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
        // Keep React the source of truth: veto the browser's own close and let
        // the parent flip `open`, which the effect turns into dialog.close().
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // With p-0 on the dialog, the dialog element is only ever the event
        // target for clicks that landed on the ::backdrop.
        if (event.target === dialogRef.current) onClose();
      }}
      className={`fixed inset-0 h-fit overflow-hidden rounded-xs border border-line bg-panel p-0 text-text shadow-lg shadow-black/50 backdrop:bg-black/60 ${placementClass} ${className}`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex min-h-8 items-center justify-between gap-2 border-b border-line px-3 py-1">
            <h2
              id={titleId}
              className="text-[11px] font-semibold tracking-widest text-text-dim uppercase"
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
