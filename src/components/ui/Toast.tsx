import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { UNSAFE_LocationContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from './controlStyles';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { LiveStatus } from './LiveStatus';
import { usePortalContainer } from './portalContainer';
import { TOAST_MS } from './useTimedToast';

interface ToastBaseProps {
  message: ReactNode;
  /**
   * The event this toast reports, when the same text can come back for a new
   * one (a second job dismissed): pass the caller's toast state object. A new
   * value is a new toast even with unchanged text. Without it, a new string
   * message is what marks a new toast.
   */
  instance?: unknown;
}

/** Plain toasts expire on their own; with `onClose` the toast runs that timer itself. */
interface PlainToastProps extends ToastBaseProps {
  undo?: undefined;
  action?: undefined;
  /** Called when the toast expires or Escape closes it. Without it the caller owns the timer. */
  onClose?: () => void;
  /** How long a plain toast stays, paused while hovered or focused. Defaults to 8s. */
  durationMs?: number;
}

/**
 * A toast offering Undo expires after 8s; one offering only another action
 * stays until dismissed (WCAG 2.2.1). Either must be able to close itself:
 * `onClose` is required here. `undo` and
 * `action` may still be `undefined` (a toast that only sometimes carries an
 * undo) — then it behaves as a plain toast and expires.
 */
interface ActionToastProps extends ToastBaseProps {
  /** Present together, or not at all — a toast with an undo action needs both. */
  undo?: { label: string; onUndo: () => void };
  /** Any other single follow-up the toast offers ("Open", "Appraise"). */
  action?: { label: string; onAction: () => void };
  onClose: () => void;
  durationMs?: number;
}

export type ToastProps = PlainToastProps | ActionToastProps;

/**
 * Fixed-position confirmation, floating above the tab bar. An "Undo" link
 * when `undo` is given. A plain or Undo toast expires, and hover or
 * focus-within pauses what is left of its clock; an action-only toast stays
 * until dismissed. Close button, Escape, the next toast and a route change
 * close an Undo or action toast sooner.
 *
 * Portalled to `document.body` rather than rendered in place: `position:
 * fixed` is relative to the nearest ancestor with a `transform`/`filter`/
 * `backdrop-filter` (every `Panel` has one, for its `backdrop-blur-sm`), not
 * the viewport, in every browser that implements the spec. A caller inside a
 * long `Panel` — Hauling's Copy multibuy list button, at the very top of a list
 * that scrolls the page well past the viewport — pinned the toast off-screen
 * at the bottom of that panel instead of the bottom of the screen.
 *
 * Inside a `Modal` it portals into the modal's own container instead
 * (`portalContainer.ts`): the native `<dialog>` sits in the browser's top
 * layer, so a toast on `document.body` would render behind its backdrop. That
 * container has no transformed ancestor, so `fixed` still pins to the viewport.
 */
export function Toast({
  message,
  instance,
  undo,
  action,
  onClose,
  durationMs = TOAST_MS,
}: ToastProps) {
  const { t } = useTranslation();
  const portalContainer = usePortalContainer();
  const persistent = Boolean(undo || action);
  const pathname = useContext(UNSAFE_LocationContext)?.location.pathname;

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Counts the toasts this one instance has shown: a new one replaying in place
  // restarts the clock, the rise and the announcement. String messages only
  // without `instance`, like the live region — a JSX message is a new object
  // every render. Adjusted during render so all three see the same count.
  const signal = instance !== undefined ? instance : typeof message === 'string' ? message : null;
  const [seenSignal, setSeenSignal] = useState(signal);
  const [occurrence, setOccurrence] = useState(0);
  if (signal !== null && signal !== seenSignal) {
    setSeenSignal(signal);
    setOccurrence((n) => n + 1);
  }

  // Hover or focus anywhere inside holds the clock; it resumes with what was left.
  const [held, setHeld] = useState(false);
  const remainingRef = useRef(durationMs);
  const clockFor = useRef(occurrence);
  // An Undo toast expires like a plain one; an action-only toast stays until dismissed.
  const expires = Boolean(onClose) && (Boolean(undo) || !persistent);
  useEffect(() => {
    if (!expires || held) return;
    if (clockFor.current !== occurrence) {
      clockFor.current = occurrence;
      remainingRef.current = durationMs;
    }
    const startedAt = Date.now();
    const timer = setTimeout(() => onCloseRef.current?.(), remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [expires, held, occurrence, durationMs]);

  // A route change clears an action toast: its Undo belongs to the page it was raised on.
  const mountedPathname = useRef(pathname);
  useEffect(() => {
    if (persistent && pathname !== mountedPathname.current) onCloseRef.current?.();
  }, [persistent, pathname]);

  // Where focus was before it entered the toast, so Escape can hand it back.
  const rootRef = useRef<HTMLDivElement>(null);
  const cameFrom = useRef<HTMLElement | null>(null);

  // A new toast replacing the old one in place replays the rise, so the two
  // read as different toasts rather than a text swap. Restarted rather than
  // re-keyed: a remount would drop focus from Undo or close. Layout effect, so
  // the new text never paints once at rest before rising.
  const risenFor = useRef(occurrence);
  useLayoutEffect(() => {
    if (occurrence === risenFor.current) return;
    risenFor.current = occurrence;
    for (const animation of rootRef.current?.getAnimations?.() ?? []) {
      if ('animationName' in animation && animation.animationName === 'toast-in') {
        animation.cancel();
        animation.play();
      }
    }
  }, [occurrence]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Escape' || !onClose) return;
    e.preventDefault();
    e.stopPropagation();
    const back = cameFrom.current;
    onClose();
    if (back?.isConnected) back.focus();
  }

  return createPortal(
    <div
      ref={rootRef}
      className="toast-in bg-panel-2 border-line-bright text-text fixed bottom-32 left-1/2 z-40 flex w-[95vw] -translate-x-1/2 items-center gap-3 rounded-xs border px-4 py-2 text-sm shadow-[0_8px_24px_rgb(0_0_0/0.6)] md:bottom-16 md:w-auto md:max-w-[calc(100vw-2rem)]"
      // Mouse only: a tap emulates mouseenter and nothing ever sends the leave.
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHeld(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHeld(false)}
      onFocus={(e) => {
        const from = e.relatedTarget;
        if (!rootRef.current?.contains(from)) {
          cameFrom.current = from instanceof HTMLElement ? from : null;
        }
        setHeld(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Visible copy is hidden from AT; the live region below announces it. The
          toast mounts already filled, which a bare role="status" announces unreliably. */}
      <span aria-hidden="true" className="min-w-0 break-words">
        {message}
      </span>
      <LiveStatus announceKey={occurrence}>{message}</LiveStatus>
      {undo && (
        <button type="button" className={`${inlineLinkClassName} shrink-0`} onClick={undo.onUndo}>
          {undo.label}
        </button>
      )}
      {action && (
        <button
          type="button"
          className={`${inlineLinkClassName} shrink-0`}
          onClick={action.onAction}
        >
          {action.label}
        </button>
      )}
      {persistent && (
        <IconButton
          icon={<Icon.Close />}
          label={t('common.close')}
          variant="plain"
          size="row"
          onClick={onClose}
        />
      )}
    </div>,
    portalContainer ?? document.body
  );
}
