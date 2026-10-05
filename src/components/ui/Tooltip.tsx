import {
  cloneElement,
  useContext,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cx } from '@/lib/cx';
import { usePortalContainer } from './portalContainer';
import { HOLD_MS, HOLD_SLOP_PX, TooltipHoldContext } from './tooltipHold';

/** Generous bound on a device's touchend→click echo delay; the tests confirm a later, real click still closes the tooltip normally once this expires. */
const TOUCH_CLICK_ECHO_MS = 700;

/**
 * Whether the latest input was a pointer press rather than a key. jsdom has no
 * `:focus-visible`, and the browser's own heuristic is invisible to a
 * controlled `open`, so track it: a focus that follows a tap or click is not
 * keyboard navigation.
 */
const inputModality = { pointer: false };
let modalityTracked = false;
function trackInputModality() {
  if (modalityTracked || typeof document === 'undefined') return;
  modalityTracked = true;
  document.addEventListener(
    'pointerdown',
    () => {
      inputModality.pointer = true;
    },
    true
  );
  document.addEventListener(
    'keydown',
    () => {
      inputModality.pointer = false;
    },
    true
  );
}

interface TooltipProps {
  /**
   * Tooltip content. Usually one line of plain language, where a literal `
`
   * renders as a line break (`whitespace-pre-line`) — for a rare second line
   * like a formula's numbers.
   *
   * A node is for the rare bubble that must lead with something the reader
   * cannot miss (the industry materials table's make-or-buy verdict, bold over
   * its reasoning), never for laying out a panel: 14rem of undismissable,
   * unscrollable hover is the wrong home for a list, and on touch it is only
   * reachable by long-press.
   */
  content: ReactNode;
  /** Single focusable trigger element (button, etc.) — tooltip reveals on hover or focus. */
  children: ReactElement<{ className?: string }>;
  /**
   * Touch triggers whose only job is explaining: a plain tap reveals the
   * tooltip (and taps again to hide it), instead of a touch-and-hold. Leave
   * off whenever the tap itself does something — the tap belongs to that
   * action, and touch-and-hold stays the way to read the tooltip.
   */
  openOnTap?: boolean;
  /** Extra classes merged onto the trigger element, e.g. `w-full` so a full-width trigger stays full-width. */
  className?: string;
}

/**
 * Accessible tooltip built on Radix's `Tooltip` primitive (docs/adr/0008):
 * placement is collision-aware — Radix flips side and shifts along its axis
 * so the bubble never renders partially off-screen, and it portals to
 * `document.body` so a clipping scroll container can't cut it off either.
 *
 * Radix's own pointer handling ignores touch, so touch reveals the tooltip
 * via our own state, OR'd into Radix's controlled `open`: a touch-and-hold by
 * default, a plain tap under `openOnTap`. Revealing never calls
 * `preventDefault`, so a trigger's own tap action, or an ancestor's click
 * handler (a table row, say), still fires.
 *
 * Radix's `Trigger` closes on *any* click, and a real device echoes a
 * compatibility `click` a moment after `touchend` — so an `openOnTap` bubble
 * would open and immediately flash shut. `suppressEchoedClose` intercepts
 * that echo through `composeEventHandlers`'s own extension point (it skips
 * Radix's close when `event.preventDefault()` was already called), so only
 * Radix's close is swallowed — the click itself still bubbles normally.
 * A touch-revealed tooltip has no timeout — it stays up to be read, until
 * something dismisses it: a tap outside, a scroll, Escape, or another tap on
 * an `openOnTap` trigger.
 */
export function Tooltip({ content, children, openOnTap = false, className = '' }: TooltipProps) {
  // Off inside a row menu, whose touch-and-hold is the menu's (see `tooltipHold.ts`).
  const holdOpens = useContext(TooltipHoldContext);
  // Inside a `Modal` this is the dialog's own body; everywhere else it is null,
  // which Radix reads as "portal to document.body" — see `portalContainer.ts`.
  // A `<dialog>` opened with `showModal()` sits in the browser's top layer,
  // which no `z-index` can reach, so a body-portalled bubble renders behind
  // the modal that triggered it.
  const container = usePortalContainer();
  const [hoverOpen, setHoverOpen] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const touchDragged = useRef(false);
  /** `undefined` between touch sequences, so the first handler of a sequence wins the capture. */
  const openAtTouchStart = useRef<boolean | undefined>(undefined);
  /** `null` until a tap opens the tooltip; then the echoed click has a deadline to beat. */
  const touchOpenedAt = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mouseHovering = useRef(false);

  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

  /**
   * A second tap has to close the bubble, and the pointerdown that dismisses
   * it fires before `touchstart` — so read the open state at whichever of the
   * two arrives first, before any dismissal can rewrite it.
   */
  function captureOpenState() {
    if (openAtTouchStart.current !== undefined) return;
    openAtTouchStart.current = touchOpen;
  }

  function endTouchSequence() {
    cancelLongPress();
    openAtTouchStart.current = undefined;
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.pointerType !== 'mouse') captureOpenState();
  }

  function handleTouchStart(event: TouchEvent) {
    captureOpenState();
    cancelLongPress();
    touchDragged.current = event.touches.length > 1;
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    touchOrigin.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    if (!openOnTap && holdOpens && !touchDragged.current) {
      longPressTimer.current = setTimeout(() => setTouchOpen(true), HOLD_MS);
    }
  }

  function handleTouchMove(event: TouchEvent) {
    if (touchDragged.current) return;
    const origin = touchOrigin.current;
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    const dragged =
      event.touches.length > 1 ||
      (!!touch &&
        !!origin &&
        (Math.abs(touch.clientX - origin.x) > HOLD_SLOP_PX ||
          Math.abs(touch.clientY - origin.y) > HOLD_SLOP_PX));
    if (dragged) {
      touchDragged.current = true;
      cancelLongPress();
    }
  }

  function handleTouchEnd(event: TouchEvent) {
    const wasOpen = openAtTouchStart.current;
    const lastFingerUp = event.touches.length === 0;
    endTouchSequence();
    if (openOnTap && lastFingerUp && !touchDragged.current) {
      const opening = !wasOpen;
      if (opening) touchOpenedAt.current = Date.now();
      setTouchOpen(opening);
    }
  }

  function suppressEchoedClose(event: MouseEvent) {
    if (
      openOnTap &&
      touchOpenedAt.current !== null &&
      Date.now() - touchOpenedAt.current < TOUCH_CLICK_ECHO_MS
    ) {
      event.preventDefault();
    }
  }

  /** The browser took the gesture over (a scroll, usually) — no touchend is coming. */
  function handleTouchCancel() {
    touchDragged.current = true;
    endTouchSequence();
  }

  /**
   * Every dismissal Radix knows about — Escape, scroll, a tap outside, another
   * tooltip, a hybrid device's mouse leaving — arrives here. Clearing the
   * touch reveal too keeps a timeout-free bubble from getting stuck open.
   */
  function handleOpenChange(open: boolean) {
    if (open && isNonKeyboardFocusOpen()) return;
    setHoverOpen(open);
    if (!open) setTouchOpen(false);
  }

  /**
   * Radix opens on any focus, including a dialog handing focus back to its
   * trigger on close — which pops the bubble over whatever sits beside it.
   * Only keyboard-driven focus should open it (`:focus-visible` semantics); a
   * hovering mouse still does, since its focus is not what opened it.
   */
  function isNonKeyboardFocusOpen() {
    const el = triggerRef.current;
    return !!el && !mouseHovering.current && document.activeElement === el && inputModality.pointer;
  }

  function handlePointerEnter(event: PointerEvent) {
    mouseHovering.current = event.pointerType === 'mouse';
  }

  function handlePointerLeave() {
    mouseHovering.current = false;
  }

  useEffect(() => {
    trackInputModality();
    return cancelLongPress;
  }, []);

  const trigger =
    isValidElement(children) && className
      ? cloneElement(children, {
          className: cx((children.props as { className?: string }).className, className),
        })
      : children;

  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root open={hoverOpen || touchOpen} onOpenChange={handleOpenChange}>
        <TooltipPrimitive.Trigger
          asChild
          ref={triggerRef}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          onClick={suppressEchoedClose}
          // A tap opens this bubble, so a clickable table row must leave the
          // tap to it rather than open the row too (see DataTable).
          data-row-control={openOnTap ? '' : undefined}
        >
          {trigger}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            sideOffset={4}
            collisionPadding={8}
            className="pointer-events-none z-50 max-w-56 rounded-xs border border-line bg-panel p-2 text-[0.6875rem] font-normal whitespace-pre-line text-text-dim normal-case shadow-lg shadow-black/50"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

interface InfoTooltipProps {
  /** Accessible name for the trigger button, e.g. "About Material Efficiency". */
  label: string;
  /** One-line plain-language tooltip content; a node only to bold a caveat (see `Tooltip`). */
  content: ReactNode;
  /**
   * @deprecated Tooltip-only now (DESIGN.md §6c): a trigger that acts on click
   * is an `IconButton` with its own tooltip. Kept only until `ResultsSummary`
   * migrates (package B, #2659); delete once nothing passes it.
   * TODO(#2659): remove `onClick` and `aria-haspopup` with that migration.
   */
  onClick?: () => void;
  /** @deprecated See `onClick`. */
  'aria-haspopup'?: 'dialog';
  /** `accent` tints the trigger like the value it annotates; default is the dim glyph. */
  tone?: 'dim' | 'accent';
  /** `info` draws an "i" instead of "?": a note on a value, not jargon to explain. */
  glyph?: 'help' | 'info';
  className?: string;
}

/** Small "?" (or "i") icon button + Tooltip, for labeling jargon next to a heading/label that isn't itself focusable. */
export function InfoTooltip({
  label,
  content,
  onClick,
  tone = 'dim',
  glyph = 'help',
  className = '',
  'aria-haspopup': ariaHasPopup,
}: InfoTooltipProps) {
  return (
    <Tooltip content={content} openOnTap={!onClick}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        aria-haspopup={ariaHasPopup}
        className={`relative inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line before:absolute before:-inset-1 before:content-[''] text-[0.625rem] leading-none hover:border-line-bright hover:text-text focus-visible:outline-2 focus-visible:outline-accent ${tone === 'accent' ? 'text-accent' : 'text-text-dim'} ${className}`}
      >
        {glyph === 'info' ? 'i' : '?'}
      </button>
    </Tooltip>
  );
}
