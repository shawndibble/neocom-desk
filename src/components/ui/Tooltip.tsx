import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { cx } from '@/lib/cx';

/** Matches Material UI's `enterTouchDelay` — long enough to not fire on an incidental brush, short enough to feel responsive. */
const TOUCH_LONG_PRESS_MS = 500;
/** Matches Material UI's `leaveTouchDelay` — how long a touch-revealed tooltip stays up before auto-dismissing. */
const TOUCH_AUTO_DISMISS_MS = 1500;

interface TooltipProps {
  /** One-line plain-language tooltip content. */
  content: string;
  /** Single focusable trigger element (button, etc.) — tooltip reveals on hover or focus. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  /** Extra classes for the wrapping span, e.g. `w-full` so a full-width trigger stays full-width. */
  className?: string;
}

/**
 * Accessible tooltip: reveals a `role="tooltip"` bubble on hover or focus of
 * its trigger child (CSS `:hover`/`:focus-within` on the wrapping span — no
 * JS state), and wires `aria-describedby` onto the trigger so screen readers
 * announce the content too — a `display:none` `role="tooltip"` node alone is
 * not announced by itself.
 *
 * Touch devices have no hover and unreliable `:focus`, so a touch-and-hold on
 * the trigger also reveals the tooltip (JS state, on top of the CSS reveal
 * above). A quick tap doesn't start it and never blocks the trigger's own tap
 * action — the long-press timer only starts the reveal, it never calls
 * `preventDefault`.
 */
export function Tooltip({ content, children, className = '' }: TooltipProps) {
  const id = useId();
  const [touchOpen, setTouchOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
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

  useEffect(() => {
    return () => {
      cancelLongPress();
      cancelAutoDismiss();
    };
  }, []);

  useEffect(() => {
    if (!touchOpen) return;
    function dismissOnOutsideTap(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        cancelAutoDismiss();
        setTouchOpen(false);
      }
    }
    document.addEventListener('pointerdown', dismissOnOutsideTap);
    return () => document.removeEventListener('pointerdown', dismissOnOutsideTap);
  }, [touchOpen]);

  const trigger = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': id })
    : children;

  return (
    <span
      ref={rootRef}
      className={cx('group relative inline-flex', className)}
      onTouchStart={handleTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
      {trigger}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-56 -translate-x-1/2 rounded-xs border border-line bg-panel p-2 text-[0.6875rem] font-normal text-text-dim normal-case shadow-lg shadow-black/50 group-hover:block group-focus-within:block ${touchOpen ? 'block' : 'hidden'}`}
      >
        {content}
      </span>
    </span>
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
