import {
  cloneElement,
  createContext,
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

const TOUCH_CLICK_ECHO_MS = 700;

export const TOOLTIP_HOVER_DELAY_MS = 400;
const TOOLTIP_SKIP_DELAY_MS = 300;

const InsideTooltipProvider = createContext(false);

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <InsideTooltipProvider.Provider value={true}>
      <TooltipPrimitive.Provider
        delayDuration={TOOLTIP_HOVER_DELAY_MS}
        skipDelayDuration={TOOLTIP_SKIP_DELAY_MS}
      >
        {children}
      </TooltipPrimitive.Provider>
    </InsideTooltipProvider.Provider>
  );
}

function ProviderUnlessShared({ children }: { children: ReactNode }) {
  if (useContext(InsideTooltipProvider)) return children;
  return <TooltipPrimitive.Provider delayDuration={0}>{children}</TooltipPrimitive.Provider>;
}

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
  content: ReactNode;
  children: ReactElement<{ className?: string }>;
  openOnTap?: boolean;
  className?: string;
  side?: 'top' | 'bottom';
}

export function Tooltip({
  content,
  children,
  openOnTap = false,
  className = '',
  side = 'top',
}: TooltipProps) {
  const holdOpens = useContext(TooltipHoldContext);
  const container = usePortalContainer();
  const [hoverOpen, setHoverOpen] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const touchDragged = useRef(false);
  const openAtTouchStart = useRef<boolean | undefined>(undefined);
  const touchOpenedAt = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasContent =
    content !== null && content !== undefined && content !== false && content !== '';
  const mouseHovering = useRef(false);

  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

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
      return;
    }
    forceClose();
  }

  function forceClose() {
    setHoverOpen(false);
    setTouchOpen(false);
  }

  function handleEscape() {
    if (!triggerRef.current?.closest('[role="menu"]')) return;
    forceClose();
    setTimeout(
      () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      0
    );
  }

  function handleTouchCancel() {
    touchDragged.current = true;
    endTouchSequence();
  }

  function handleOpenChange(open: boolean) {
    if (open && isNonKeyboardFocusOpen()) return;
    setHoverOpen(open);
    if (!open) setTouchOpen(false);
  }

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
    <ProviderUnlessShared>
      <TooltipPrimitive.Root
        open={(hoverOpen || touchOpen) && hasContent}
        onOpenChange={handleOpenChange}
      >
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
          onBlur={forceClose}
          data-row-control={openOnTap ? '' : undefined}
        >
          {trigger}
        </TooltipPrimitive.Trigger>
        {hasContent && (
          <TooltipPrimitive.Portal container={container}>
            <TooltipPrimitive.Content
              side={side}
              sideOffset={4}
              collisionPadding={8}
              onEscapeKeyDown={handleEscape}
              className="motion-fade z-50 max-w-56 rounded-xs border border-line bg-panel p-2 text-[0.6875rem] font-normal whitespace-pre-line text-text-dim normal-case shadow-lg shadow-black/50"
            >
              {content}
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        )}
      </TooltipPrimitive.Root>
    </ProviderUnlessShared>
  );
}

interface InfoTooltipProps {
  label: string;
  content: ReactNode;
  tone?: 'dim' | 'accent';
  glyph?: 'help' | 'info';
  className?: string;
}

export function InfoTooltip({
  label,
  content,
  tone = 'dim',
  glyph = 'help',
  className = '',
}: InfoTooltipProps) {
  return (
    <Tooltip content={content} openOnTap>
      <button
        type="button"
        aria-label={label}
        className={`group/info -m-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] leading-none hover:text-text focus-visible:outline-2 focus-visible:outline-accent ${tone === 'accent' ? 'text-accent' : 'text-text-dim'} ${className}`}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-4 items-center justify-center rounded-full border border-line group-hover/info:border-line-bright"
        >
          {glyph === 'info' ? 'i' : '?'}
        </span>
      </button>
    </Tooltip>
  );
}
