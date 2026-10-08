import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { PortalContainerProvider } from './portalContainer';
import { RowTappableContext } from './tooltipHold';
import { useOverlayHistory } from '@/lib/useOverlayHistory';
import { useSheetSwipe } from './useSheetSwipe';

export type ModalPlacement = 'center' | 'sheet' | 'sheet-full' | 'wide' | 'media';

interface ModalProps {
  /** Parent owns the state; the modal never closes itself. */
  open: boolean;
  /** Id on the `<dialog>` itself, for a trigger's `aria-controls`. */
  id?: string;
  /** Requested close — Escape, backdrop click, or the header close button. */
  onClose: () => void;
  /** Visible heading and the dialog's accessible name. Usually a string; a node is for a title that needs inline styling (e.g. a colored value), since `aria-labelledby` reads whatever text content renders. */
  title: ReactNode;
  /**
   * Rendered beside the title, outside the `<h2>` `aria-labelledby` points
   * to — a "More actions" button here (issue #1498) must not fold its own
   * `aria-label` into the dialog's accessible name the way an element
   * inside `title` would.
   */
  titleActions?: ReactNode;
  children: ReactNode;
  /**
   * Where focus lands on open instead of the dialog body — the one field a
   * dialog exists to fill (a quantity), so the user can type straight away.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** `center` for dialogs, `sheet` for a bottom-anchored mobile drawer, `sheet-full` for the same drawer at full viewport height (long lists), `wide` for multi-column content (e.g. a comparison matrix), `media` for an enlarged image — sized to its content up to 95% of the viewport. */
  placement?: ModalPlacement;
  /**
   * Whether the modal owns a history entry so Back closes it (default). Pass
   * `false` only for a modal already backed by a URL (the `info` search
   * param), whose own history entry would otherwise be pushed twice.
   */
  closeOnBack?: boolean;
  /**
   * Where focus goes on close when nothing on the page held it as the modal
   * opened (a sheet a URL opened), or that element is gone.
   */
  returnFocusFallback?: () => HTMLElement | null;
}

/**
 * Per placement: the dialog's own box, and the height cap that box and its
 * inner column share — one entry, so the two can never disagree.
 */
const PLACEMENT_CLASSES: Record<ModalPlacement, { dialogClass: string; heightClass: string }> = {
  center: { dialogClass: 'm-auto w-full max-w-lg', heightClass: 'h-fit max-h-[85vh]' },
  sheet: {
    dialogClass: 'mx-auto mt-auto mb-0 w-full max-w-md rounded-b-none',
    heightClass: 'h-fit max-h-[85vh]',
  },
  'sheet-full': {
    dialogClass: 'mx-auto mt-auto mb-0 w-full max-w-md rounded-b-none',
    heightClass: 'h-dvh max-h-dvh',
  },
  wide: {
    dialogClass: 'm-auto w-full max-w-[min(64rem,100vw)]',
    heightClass: 'h-fit max-h-[85vh]',
  },
  media: { dialogClass: 'm-auto w-fit max-w-[95vw]', heightClass: 'h-fit max-h-[95vh]' },
};

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
export function Modal({
  open,
  id,
  onClose,
  title,
  titleActions,
  children,
  placement = 'center',
  initialFocusRef,
  closeOnBack = true,
  returnFocusFallback,
}: ModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isSheet = placement.startsWith('sheet');
  useOverlayHistory(open, onClose, closeOnBack);
  const swipe = useSheetSwipe(dialogRef, onClose, isSheet);
  const titleId = useId();
  // State, not a ref: a Radix portal needs to re-render once the node exists,
  // and a ref assignment alone would not schedule that render.
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  // Read at close, so a new callback each render never reopens the dialog.
  const fallbackRef = useRef(returnFocusFallback);
  useEffect(() => {
    fallbackRef.current = returnFocusFallback;
  });
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
    // After showModal(), whose own focusing steps land on the body: a child's
    // mount-time focus() would run first (child effects fire before this one)
    // and be overridden.
    initialFocusRef?.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      const kept =
        trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected
          ? trigger
          : null;
      const fallback = kept ? null : (fallbackRef.current?.() ?? null);
      if (kept) kept.focus();
      // The fallback may sit off screen (a page heading): moving focus must not scroll there.
      else if (fallback?.isConnected) fallback.focus({ preventScroll: true });
      else if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open, initialFocusRef]);

  const { dialogClass, heightClass } = PLACEMENT_CLASSES[placement];

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
      className={`fixed inset-0 overflow-hidden rounded-xs border border-line bg-panel p-0 text-text shadow-lg shadow-black/50 backdrop:bg-black/60 ${heightClass} ${dialogClass}`}
    >
      {open && (
        // The provider spans the header too, not just the body: a title can
        // carry its own overlay (e.g. an item name's right-click menu), and
        // one portaled to `document.body` would
        // land behind the top layer — see `portalContainer.ts`.
        <PortalContainerProvider value={portalContainer}>
          <div className={`flex ${heightClass} flex-col`}>
            {/* The drag zone for swipe-down-to-dismiss: grabber plus header,
              never the scrolled body. `touch-none` keeps the browser from
              taking the vertical pan for itself. */}
            <div {...swipe} className={isSheet ? 'touch-none bg-panel-2' : undefined}>
              {isSheet && (
                // Decorative: Escape, Back and the close button are the
                // accessible ways out, so it is neither focusable nor read.
                <div aria-hidden="true" className="flex justify-center pt-2">
                  <span className="h-1 w-10 rounded-full bg-line-bright" />
                </div>
              )}
              <header className="flex min-h-11 items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-1 md:min-h-9">
                <h2
                  id={titleId}
                  className="min-w-0 flex-1 truncate text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
                >
                  {title}
                </h2>
                {titleActions}
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
            </div>
            {/* `overscroll-contain` plus the `body:has(dialog[open])` rule in
              index.css: a native dialog does not lock the page behind it, so
              on a phone a scroll that starts over the sheet would otherwise
              chain straight into the page underneath. */}
            {/* A sheet's content may end in a sticky action footer
              (FilterSheet); the scroll padding keeps a control focused near
              the bottom from scrolling in underneath it (WCAG 2.4.11). */}
            <div
              ref={bodyRef}
              tabIndex={-1}
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 outline-none${isSheet ? ' scroll-pb-20 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]' : ''}`}
            >
              <RowTappableContext.Provider value={false}>{children}</RowTappableContext.Provider>
            </div>
          </div>
        </PortalContainerProvider>
      )}
    </dialog>
  );
}
