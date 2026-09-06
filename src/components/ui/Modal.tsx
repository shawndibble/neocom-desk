import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { PortalContainerProvider } from './portalContainer';

export type ModalPlacement = 'center' | 'sheet' | 'wide';

interface ModalProps {
  /** Parent owns the state; the modal never closes itself. */
  open: boolean;
  /** Id on the `<dialog>` itself, for a trigger's `aria-controls`. */
  id?: string;
  /** Requested close — Escape, backdrop click, or the header close button. */
  onClose: () => void;
  /** Visible heading and the dialog's accessible name. Usually a string; a node is for a title that needs inline styling (e.g. a colored value), since `aria-labelledby` reads whatever text content renders. */
  title: ReactNode;
  children: ReactNode;
  /** `center` for dialogs, `sheet` for a bottom-anchored mobile drawer, `wide` for multi-column content (e.g. a comparison matrix). */
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
  // State, not a ref: a Radix portal needs to re-render once the node exists,
  // and a ref assignment alone would not schedule that render.
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  // `showModal()` focuses the first focusable element — the header's close
  // `IconButton` — and its Radix tooltip arms on focus: a stray "Close"
  // bubble floated over every freshly opened dialog, and the first Escape
  // press dismissed the bubble instead of the dialog. Moving focus away
  // *after* `showModal()` is too late (the tooltip opens on a zero-delay
  // timer, after the blur it would have needed), so the body carries the
  // `autofocus` attribute instead: the dialog focusing steps then land on
  // it directly and the close button never receives focus on open. Set as a
  // DOM attribute because React's `autoFocus` prop is a mount-time
  // `.focus()` call, which does nothing inside a not-yet-shown dialog.
  const bodyRef = useCallback((element: HTMLDivElement | null) => {
    setPortalContainer(element);
    element?.setAttribute('autofocus', '');
  }, []);

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
      : placement === 'wide'
        ? 'm-auto max-h-[85vh] w-full max-w-5xl'
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
            {/* `Icon.Close` via `IconButton`, not the hand-rolled "×" glyph
                this replaced: DESIGN.md's icon rules require an icon-only
                control to be an `IconButton` and forbid a dingbat character
                standing in for one, and the mobile "More" sheet's close
                control was flagged at 23×28px — under the documented 44px
                touch tier every other icon action in the header now gets. */}
            <IconButton
              variant="plain"
              icon={<Icon.Close />}
              label={t('common.close')}
              onClick={onClose}
            />
          </header>
          {/* `overscroll-contain` plus the `body:has(dialog[open])` rule in
              index.css: a native dialog does not lock the page behind it, so
              on a phone a scroll that starts over the sheet would otherwise
              chain straight into the page underneath. */}
          <div
            ref={bodyRef}
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 outline-none"
          >
            <PortalContainerProvider value={portalContainer}>{children}</PortalContainerProvider>
          </div>
        </div>
      )}
    </dialog>
  );
}
