import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cx } from '@/lib/cx';

/** Matches Material UI's `enterTouchDelay` — long enough to not fire on an incidental brush, short enough to feel responsive. */
const TOUCH_LONG_PRESS_MS = 500;
/** Matches Material UI's `leaveTouchDelay` — how long a touch-revealed tooltip stays up before auto-dismissing. */
const TOUCH_AUTO_DISMISS_MS = 1500;

interface TooltipProps {
  /** One-line plain-language tooltip content. */
  content: string;
  /** Single focusable trigger element (button, etc.) — tooltip reveals on hover or focus. */
  children: ReactElement<{ className?: string }>;
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
 * a touch-and-hold on the trigger reveals the tooltip via our own state,
 * OR'd into Radix's controlled `open`. A quick tap doesn't start it and never
 * blocks the trigger's own tap action — the long-press timer only starts the
 * reveal, it never calls `preventDefault`.
 */
export function Tooltip({ content, children, className = '' }: TooltipProps) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

  function cancelAutoDismiss() {
    clearTimeout(dismissTimer.current);
  }

  function handleTouchStart() {
    cancelLongPress();
    cancelAutoDismiss();
    longPressTimer.current = setTimeout(() => {
      setTouchOpen(true);
      dismissTimer.current = setTimeout(() => setTouchOpen(false), TOUCH_AUTO_DISMISS_MS);
    }, TOUCH_LONG_PRESS_MS);
  }

  function dismissTouch() {
    cancelAutoDismiss();
    setTouchOpen(false);
  }

  useEffect(() => {
    return () => {
      cancelLongPress();
      cancelAutoDismiss();
    };
  }, []);

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
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
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
  className?: string;
}

/** Small "?" icon button + Tooltip, for labeling jargon next to a heading/label that isn't itself focusable. */
export function InfoTooltip({ label, content, className = '' }: InfoTooltipProps) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label={label}
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-[0.625rem] leading-none text-text-dim hover:border-line-bright hover:text-text focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      >
        ?
      </button>
    </Tooltip>
  );
}
