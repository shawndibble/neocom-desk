import { clamp } from '@/engine/math';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { DISMISS_SLIDE_MS, DRAG_SLOP, SWIPE_DISMISS_DISTANCE } from './useSheetSwipe';

interface DrawerResizeOptions {
  min: number;
  initial: number;
  step: number;
  maxFraction: number;
  onDismiss: () => void;
  enabled: boolean;
}

export interface DrawerResize {
  height: number;
  max: number;
  dragProps: {
    onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
    onPointerCancel(): void;
  };
  onKeyDown(event: ReactKeyboardEvent<HTMLElement>): void;
  style: CSSProperties;
}

export function useDrawerResize({
  min,
  initial,
  step,
  maxFraction,
  onDismiss,
  enabled,
}: DrawerResizeOptions): DrawerResize {
  const reduced = usePrefersReducedMotion();

  const ceiling = useCallback(() => {
    if (typeof window === 'undefined') return min;
    return Math.max(min, Math.round(window.innerHeight * maxFraction));
  }, [min, maxFraction]);

  const [max, setMax] = useState(ceiling);
  const [height, setHeight] = useState(() => clamp(initial, min, ceiling()));
  const [overpullPx, setOverpullPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const onResize = () => {
      const next = ceiling();
      setMax(next);
      setHeight((current) => clamp(current, min, next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ceiling, min]);

  const slide = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(slide.current), []);

  const commit = useCallback(() => {
    if (reduced) {
      setOverpullPx(0);
      onDismissRef.current();
      return;
    }
    setLeaving(true);
    setOverpullPx(min);
    slide.current = window.setTimeout(() => {
      setLeaving(false);
      setOverpullPx(0);
      onDismissRef.current();
    }, DISMISS_SLIDE_MS);
  }, [min, reduced]);

  const gesture = useRef<{
    startY: number;
    startHeight: number;
    max: number;
    overpull: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  const end = (dismiss: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.dragging) return;
    setDragging(false);
    if (dismiss && g.overpull >= SWIPE_DISMISS_DISTANCE) commit();
    else setOverpullPx(0);
  };

  const dragProps: DrawerResize['dragProps'] = {
    onPointerDown(event) {
      if (!enabled || leaving) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      gesture.current = {
        startY: event.clientY,
        startHeight: height,
        max,
        overpull: 0,
        dragging: false,
        pointerId: event.pointerId,
      };
    },
    onPointerMove(event) {
      const g = gesture.current;
      if (!g) return;
      const dy = event.clientY - g.startY;
      if (!g.dragging) {
        if (Math.abs(dy) < DRAG_SLOP) return;
        g.dragging = true;
        event.currentTarget.setPointerCapture?.(g.pointerId);
        setDragging(true);
      }
      const raw = g.startHeight - dy;
      g.overpull = Math.max(0, min - raw);
      setHeight(clamp(raw, min, g.max));
      setOverpullPx(g.overpull);
    },
    onPointerUp() {
      end(true);
    },
    onPointerCancel() {
      end(false);
    },
  };

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!enabled) return;
    const resize = (next: number) => {
      event.preventDefault();
      setHeight(clamp(next, min, max));
    };
    if (event.key === 'ArrowUp') resize(height + step);
    else if (event.key === 'ArrowDown') resize(height - step);
    else if (event.key === 'Home') resize(min);
    else if (event.key === 'End') resize(max);
  }

  return {
    height,
    max,
    dragProps,
    onKeyDown,
    style: {
      height,
      transform: overpullPx > 0 ? `translateY(${overpullPx}px)` : undefined,
      transition:
        dragging || reduced
          ? 'none'
          : leaving
            ? 'transform var(--motion-slow-exit) var(--motion-ease-in)'
            : 'transform var(--motion-slow-exit) var(--motion-ease-out)',
    },
  };
}
