import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type TouchEvent,
} from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cx } from '@/lib/cx';

/** Matches Material UI's `enterTouchDelay` — long enough to not fire on an incidental brush, short enough to feel responsive. */
const TOUCH_LONG_PRESS_MS = 500;
/** Finger roll during a tap: iOS fires `touchmove` for sub-pixel drift, so only real dragging should cancel. */
const TOUCH_MOVE_TOLERANCE_PX = 10;

interface TooltipProps {
  /** One-line plain-language tooltip content. */
  content: string;
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
 * Radix's own pointer handling ignores touch (no hover on touch devices), so
 * touch reveals the tooltip via our own state, OR'd into Radix's controlled
 * `open`: a touch-and-hold by default, a plain tap under `openOnTap`. Neither
 * path ever calls `preventDefault`, so a trigger that acts on tap still acts.
 * A touch-revealed tooltip has no timeout — it stays up to be read, until a
 * tap outside it (or another tap on an `openOnTap` trigger) dismisses it.
 */
export function Tooltip({ content, children, openOnTap = false, className = '' }: TooltipProps) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const touchDragged = useRef(false);
  /** Read at touch start so a tap toggles off even if Radix already dismissed the bubble in between. */
  const openAtTouchStart = useRef(false);

  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

  function handleTouchStart(event: TouchEvent) {
    cancelLongPress();
    const touch = event.touches[0];
    touchOrigin.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    touchDragged.current = false;
    openAtTouchStart.current = touchOpen;
    if (!openOnTap) {
      longPressTimer.current = setTimeout(() => setTouchOpen(true), TOUCH_LONG_PRESS_MS);
    }
  }

  function handleTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    const origin = touchOrigin.current;
    if (!touch || !origin) return;
    const dragged =
      Math.abs(touch.clientX - origin.x) > TOUCH_MOVE_TOLERANCE_PX ||
      Math.abs(touch.clientY - origin.y) > TOUCH_MOVE_TOLERANCE_PX;
    if (dragged) {
      touchDragged.current = true;
      cancelLongPress();
    }
  }

  function handleTouchEnd() {
    cancelLongPress();
    if (openOnTap && !touchDragged.current) setTouchOpen(!openAtTouchStart.current);
  }

  function dismissTouch() {
    setTouchOpen(false);
  }

  useEffect(() => cancelLongPress, []);

  const trigger =
    isValidElement(children) && className
      ? cloneElement(children, {
          className: cx((children.props as { className?: string }).className, className),
        })
      : children;

  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root open={hoverOpen || touchOpen} onOpenChange={setHoverOpen}>
        <TooltipPrimitive.Trigger
          asChild
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
        >
          {trigger}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={4}
            collisionPadding={8}
            onPointerDownOutside={dismissTouch}
            className="pointer-events-none z-50 max-w-56 rounded-xs border border-line bg-panel p-2 text-[0.6875rem] font-normal text-text-dim normal-case shadow-lg shadow-black/50"
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
  /** One-line plain-language tooltip content. */
  content: string;
  /**
   * Makes the trigger do something as well as explain: the tooltip stays the
   * one-line answer on hover/focus, the click opens the longer one. Say so in
   * `content` when this is set — a control that acts on click has to look
   * like one. On touch it also takes the tap back, leaving touch-and-hold as
   * the way to read the tooltip.
   */
  onClick?: () => void;
  /** Set when the click opens a dialog, so the trigger announces what it opens. */
  'aria-haspopup'?: 'dialog';
  className?: string;
}

/** Small "?" icon button + Tooltip, for labeling jargon next to a heading/label that isn't itself focusable. */
export function InfoTooltip({
  label,
  content,
  onClick,
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
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-[0.625rem] leading-none text-text-dim hover:border-line-bright hover:text-text focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      >
        ?
      </button>
    </Tooltip>
  );
}
