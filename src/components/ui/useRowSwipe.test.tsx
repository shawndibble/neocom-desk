import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  ROW_SWIPE_ACTIVATE_DISTANCE,
  ROW_SWIPE_DISMISS_DISTANCE,
  ROW_SWIPE_DISMISS_VELOCITY,
  useRowSwipe,
} from './useRowSwipe';
import { SWIPE_DISMISS_DISTANCE, SWIPE_DISMISS_VELOCITY } from './useSheetSwipe';

function Row({
  onDismiss,
  onClick,
  enabled = true,
}: {
  onDismiss: () => void;
  onClick?: () => void;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const swipe = useRowSwipe(ref, onDismiss, enabled);
  return (
    <ul>
      <li ref={ref} data-testid="row" onClick={onClick} {...swipe}>
        Price alert triggered
      </li>
    </ul>
  );
}

const row = () => screen.getByTestId('row');

interface SwipeOptions {
  /** Vertical drift while dragging, in px. */
  dy?: number;
  pointerType?: string;
  /** Release a beat after the last move. */
  holdMs?: number;
}

/**
 * Press, drag `dx` px (negative is toward the inline start in LTR) in two
 * steps, release. The clock is stubbed so velocity is deterministic.
 */
function swipe(el: Element, dx: number, elapsedMs: number, opts: SwipeOptions = {}) {
  const { dy = 0, pointerType = 'touch', holdMs = 0 } = opts;
  let now = 1000;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const at = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, pointerType });
  fireEvent.pointerDown(el, at(200, 100));
  now += elapsedMs / 2;
  fireEvent.pointerMove(el, at(200 + dx / 2, 100 + dy / 2));
  now += elapsedMs / 2;
  fireEvent.pointerMove(el, at(200 + dx, 100 + dy));
  now += holdMs;
  fireEvent.pointerUp(el, at(200 + dx, 100 + dy));
  spy.mockRestore();
}

function mockReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        media: query,
        matches: reduce && query.includes('prefers-reduced-motion'),
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useRowSwipe', () => {
  it('dismisses on a swipe toward the inline start past the distance threshold', () => {
    const onDismiss = vi.fn();
    render(<Row onDismiss={onDismiss} />);
    swipe(row(), -(ROW_SWIPE_DISMISS_DISTANCE + 20), 1000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on a fast flick shorter than the distance threshold', () => {
    const onDismiss = vi.fn();
    render(<Row onDismiss={onDismiss} />);
    swipe(row(), -40, 40);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores velocity from a flick that was then held still', () => {
    const onDismiss = vi.fn();
    render(<Row onDismiss={onDismiss} />);
    swipe(row(), -40, 40, { holdMs: 500 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('springs back on a short, slow swipe', () => {
    const onDismiss = vi.fn();
    render(<Row onDismiss={onDismiss} />);
    swipe(row(), -(ROW_SWIPE_DISMISS_DISTANCE - 30), 1000);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(row().style.transform).toBe('');
  });

  it('follows the finger toward the inline start while dragging', () => {
    render(<Row onDismiss={vi.fn()} />);
    fireEvent.pointerDown(row(), {
      clientX: 200,
      clientY: 100,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(row(), {
      clientX: 150,
      clientY: 100,
      pointerId: 1,
      pointerType: 'touch',
    });
    expect(row().style.transform).toBe('translateX(-50px)');
  });

  it('does not swipe the other way, toward the inline end', () => {
    const onDismiss = vi.fn();
    render(<Row onDismiss={onDismiss} />);
    swipe(row(), ROW_SWIPE_DISMISS_DISTANCE + 60, 40);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(row().style.transform).toBe('');
  });

  it('mirrors in a right-to-left context: the dismiss direction is rightward', () => {
    const onDismiss = vi.fn();
    render(
      <div dir="rtl">
        <Row onDismiss={onDismiss} />
      </div>
    );
    swipe(row(), -(ROW_SWIPE_DISMISS_DISTANCE + 20), 1000);
    expect(onDismiss).not.toHaveBeenCalled();
    swipe(row(), ROW_SWIPE_DISMISS_DISTANCE + 20, 1000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  describe('axis lock', () => {
    it('does not start a drag under the activation distance', () => {
      render(<Row onDismiss={vi.fn()} />);
      fireEvent.pointerDown(row(), {
        clientX: 200,
        clientY: 100,
        pointerId: 1,
        pointerType: 'touch',
      });
      fireEvent.pointerMove(row(), {
        clientX: 200 - (ROW_SWIPE_ACTIVATE_DISTANCE - 2),
        clientY: 100,
        pointerId: 1,
        pointerType: 'touch',
      });
      expect(row().style.transform).toBe('');
    });

    it('leaves a mostly vertical gesture to the scroller and the sheet', () => {
      const onDismiss = vi.fn();
      render(<Row onDismiss={onDismiss} />);
      swipe(row(), -120, 100, { dy: 160 });
      expect(onDismiss).not.toHaveBeenCalled();
      expect(row().style.transform).toBe('');
    });

    it('stays out once the gesture went vertical, even if it later drifts sideways', () => {
      const onDismiss = vi.fn();
      render(<Row onDismiss={onDismiss} />);
      const at = (x: number, y: number) => ({
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'touch',
      });
      fireEvent.pointerDown(row(), at(200, 100));
      fireEvent.pointerMove(row(), at(198, 130));
      fireEvent.pointerMove(row(), at(60, 135));
      fireEvent.pointerUp(row(), at(60, 135));
      expect(onDismiss).not.toHaveBeenCalled();
      expect(row().style.transform).toBe('');
    });

    it('tolerates a little vertical drift in a horizontal swipe', () => {
      const onDismiss = vi.fn();
      render(<Row onDismiss={onDismiss} />);
      swipe(row(), -120, 300, { dy: 20 });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('springs back when the browser takes the gesture over (pointercancel)', () => {
      const onDismiss = vi.fn();
      render(<Row onDismiss={onDismiss} />);
      const at = (x: number, y: number) => ({
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'touch',
      });
      fireEvent.pointerDown(row(), at(200, 100));
      fireEvent.pointerMove(row(), at(150, 100));
      fireEvent.pointerCancel(row(), at(150, 100));
      expect(row().style.transform).toBe('');
      fireEvent.pointerUp(row(), at(40, 100));
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('declares touch-action: pan-y so the browser keeps vertical scrolling', () => {
      render(<Row onDismiss={vi.fn()} />);
      expect(row().style.touchAction).toBe('pan-y');
    });
  });

  describe('pointer devices', () => {
    it('does not swipe with a mouse', () => {
      const onDismiss = vi.fn();
      render(<Row onDismiss={onDismiss} />);
      swipe(row(), -200, 100, { pointerType: 'mouse' });
      expect(onDismiss).not.toHaveBeenCalled();
      expect(row().style.transform).toBe('');
    });

    it('swipes with a pen', () => {
      const onDismiss = vi.fn();
      render(<Row onDismiss={onDismiss} />);
      swipe(row(), -200, 100, { pointerType: 'pen' });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('a row that does not swipe (enabled = false)', () => {
    it('never dismisses and never moves', () => {
      const onDismiss = vi.fn();
      render(<Row onDismiss={onDismiss} enabled={false} />);
      swipe(row(), -200, 100);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(row().style.transform).toBe('');
    });

    it('does not claim touch-action, so the row scrolls like any other', () => {
      render(<Row onDismiss={vi.fn()} enabled={false} />);
      expect(row().style.touchAction).toBe('');
    });

    it('gives the touch-action back when a row stops being swipeable', () => {
      const { rerender } = render(<Row onDismiss={vi.fn()} />);
      expect(row().style.touchAction).toBe('pan-y');
      rerender(<Row onDismiss={vi.fn()} enabled={false} />);
      expect(row().style.touchAction).toBe('');
    });
  });

  describe('the click that ends a swipe', () => {
    it('is swallowed, so a swipe never also opens the row', () => {
      const onClick = vi.fn();
      render(<Row onDismiss={vi.fn()} onClick={onClick} />);
      swipe(row(), -(ROW_SWIPE_DISMISS_DISTANCE - 30), 1000);
      fireEvent.click(row());
      expect(onClick).not.toHaveBeenCalled();
    });

    it('lets an ordinary tap through', () => {
      const onClick = vi.fn();
      render(<Row onDismiss={vi.fn()} onClick={onClick} />);
      const at = { clientX: 200, clientY: 100, pointerId: 1, pointerType: 'touch' };
      fireEvent.pointerDown(row(), at);
      fireEvent.pointerUp(row(), at);
      fireEvent.click(row());
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('motion', () => {
    it('animates the spring-back and the exit by default', () => {
      mockReducedMotion(false);
      render(<Row onDismiss={vi.fn()} />);
      swipe(row(), -(ROW_SWIPE_DISMISS_DISTANCE - 30), 1000);
      expect(row().style.transition).toContain('transform');
    });

    it('slides the row the rest of the way out on a dismiss', () => {
      mockReducedMotion(false);
      render(<Row onDismiss={vi.fn()} />);
      swipe(row(), -(ROW_SWIPE_DISMISS_DISTANCE + 20), 1000);
      expect(row().style.transform).toBe('translateX(-100%)');
      expect(row().style.transition).toContain('transform');
    });

    it('has no travel animation under prefers-reduced-motion', () => {
      mockReducedMotion(true);
      render(<Row onDismiss={vi.fn()} />);
      swipe(row(), -(ROW_SWIPE_DISMISS_DISTANCE - 30), 1000);
      expect(row().style.transition).toBe('none');
    });

    it('has no exit slide under prefers-reduced-motion: the row is simply handed over', () => {
      mockReducedMotion(true);
      const onDismiss = vi.fn();
      render(<Row onDismiss={onDismiss} />);
      swipe(row(), -(ROW_SWIPE_DISMISS_DISTANCE + 20), 1000);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(row().style.transition).toBe('none');
      expect(row().style.transform).toBe('');
    });
  });

  it('exports thresholds that match the sheet gesture', () => {
    expect(ROW_SWIPE_DISMISS_DISTANCE).toBe(SWIPE_DISMISS_DISTANCE);
    expect(ROW_SWIPE_DISMISS_VELOCITY).toBe(SWIPE_DISMISS_VELOCITY);
  });
});
