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
import { cx } from '@/lib/cx';
import { UNSAFE_LocationContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from './controlStyles';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { LiveStatus } from './LiveStatus';
import { usePortalContainer } from './portalContainer';
import { TOAST_MS } from './useTimedToast';

const TOAST_TONE = {
  success: {
    border: 'border-success',
    text: 'text-success',
    glyph: Icon.Succeeded,
    wordKey: 'common.toastTone.success',
  },
  danger: {
    border: 'border-danger',
    text: 'text-danger',
    glyph: Icon.Warn,
    wordKey: 'common.toastTone.danger',
  },
} as const;

export type ToastTone = keyof typeof TOAST_TONE;

interface ToastBaseProps {
  message: ReactNode;
  instance?: unknown;
  stacked?: boolean;
  /**
   * @summary Tints the border and adds a glyph and a spoken word.
   * `TOAST_TONE` holds the three together. Leave unset for a routine
   * confirmation; pass `success` where the outcome could have failed and
   * didn't, `danger` where it failed.
   */
  tone?: ToastTone;
}

interface PlainToastProps extends ToastBaseProps {
  undo?: undefined;
  action?: undefined;
  onClose?: () => void;
  durationMs?: number;
}

interface ActionToastProps extends ToastBaseProps {
  undo?: { label: string; onUndo: () => void };
  action?: { label: string; onAction: () => void };
  onClose: () => void;
  durationMs?: number;
}

export type ToastProps = PlainToastProps | ActionToastProps;

export function Toast({
  message,
  instance,
  stacked,
  tone,
  undo,
  action,
  onClose,
  durationMs = TOAST_MS,
}: ToastProps) {
  const { t } = useTranslation();
  const toned = tone ? TOAST_TONE[tone] : null;
  const ToneGlyph = toned?.glyph;
  const portalContainer = usePortalContainer();
  const persistent = Boolean(undo || action);
  const pathname = useContext(UNSAFE_LocationContext)?.location.pathname;

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const signal = instance !== undefined ? instance : typeof message === 'string' ? message : null;
  const [seenSignal, setSeenSignal] = useState(signal);
  const [occurrence, setOccurrence] = useState(0);
  const [leaving, setLeaving] = useState(false);
  if (signal !== null && signal !== seenSignal) {
    setSeenSignal(signal);
    setOccurrence((n) => n + 1);
    setLeaving(false);
  }

  const [held, setHeld] = useState(false);
  const remainingRef = useRef(durationMs);
  const clockFor = useRef(occurrence);
  const expires = Boolean(onClose) && (Boolean(undo) || !persistent);
  useEffect(() => {
    if (!expires || held) return;
    if (clockFor.current !== occurrence) {
      clockFor.current = occurrence;
      remainingRef.current = durationMs;
    }
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      if (typeof rootRef.current?.getAnimations === 'function') setLeaving(true);
      else onCloseRef.current?.();
    }, remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [expires, held, occurrence, durationMs]);

  const mountedPathname = useRef(pathname);
  useEffect(() => {
    if (persistent && pathname !== mountedPathname.current) onCloseRef.current?.();
  }, [persistent, pathname]);

  const undoRef = useRef<HTMLButtonElement>(null);
  const hasUndo = Boolean(undo);
  useEffect(() => {
    if (!hasUndo) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyZ') return;
      e.preventDefault();
      undoRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasUndo]);

  const rootRef = useRef<HTMLDivElement>(null);
  const cameFrom = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!leaving) return;
    const exit = rootRef.current
      ?.getAnimations()
      .find((animation) => 'animationName' in animation && animation.animationName === 'toast-out');
    if (!exit) {
      onCloseRef.current?.();
      return;
    }
    let live = true;
    exit.finished.then(
      () => live && onCloseRef.current?.(),
      () => {}
    );
    return () => {
      live = false;
    };
  }, [leaving]);

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

  const toast = (
    <div
      ref={rootRef}
      className={cx(
        leaving ? 'toast-out' : 'toast-in',
        'bg-panel-2 text-text flex items-center gap-3 rounded-xs border px-4 py-2 text-sm shadow-[0_8px_24px_rgb(0_0_0/0.6)]',
        toned?.border ?? 'border-line-bright',
        stacked
          ? 'pointer-events-auto max-w-full'
          : 'fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[95vw] -translate-x-1/2 md:bottom-16 md:w-auto md:max-w-[calc(100vw-2rem)]'
      )}
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
      {ToneGlyph && (
        <ToneGlyph
          aria-hidden="true"
          size={Icon.ICON_SIZE.sm}
          className={cx('shrink-0', toned.text)}
        />
      )}
      <span aria-hidden="true" className="min-w-0 break-words">
        {message}
      </span>
      <LiveStatus announceKey={occurrence}>
        {toned && <>{t(toned.wordKey)}: </>}
        {message}
      </LiveStatus>
      {undo && (
        <button
          ref={undoRef}
          type="button"
          aria-keyshortcuts="Alt+Z"
          className={`${inlineLinkClassName} shrink-0`}
          onClick={undo.onUndo}
        >
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
    </div>
  );
  return stacked ? toast : createPortal(toast, portalContainer ?? document.body);
}
