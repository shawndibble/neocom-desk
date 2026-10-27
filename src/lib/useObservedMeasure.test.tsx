import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useObservedMeasure } from './useObservedMeasure';

type Observer = { callback: () => void; observed: Element[]; disconnect: () => void };

function stubResizeObserver(): Observer[] {
  const observers: Observer[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      entry: Observer;
      constructor(callback: () => void) {
        this.entry = { callback, observed: [], disconnect: vi.fn() };
        observers.push(this.entry);
      }
      observe(element: Element) {
        this.entry.observed.push(element);
      }
      disconnect() {
        this.entry.disconnect();
      }
    }
  );
  return observers;
}

afterEach(() => vi.unstubAllGlobals());

describe('useObservedMeasure', () => {
  it('measures on mount, then on each resize of every target, and disconnects', () => {
    const observers = stubResizeObserver();
    const a = document.createElement('div');
    const b = document.createElement('div');
    const measure = vi.fn();
    const { unmount } = renderHook(() => useObservedMeasure(() => [a, b], measure, []));
    expect(measure).toHaveBeenCalledTimes(1);
    expect(observers[0]!.observed).toEqual([a, b]);
    act(() => observers[0]!.callback());
    expect(measure).toHaveBeenCalledTimes(2);
    unmount();
    expect(observers[0]!.disconnect).toHaveBeenCalled();
  });

  it('does nothing while targets returns null', () => {
    const observers = stubResizeObserver();
    const measure = vi.fn();
    renderHook(() => useObservedMeasure(() => null, measure, []));
    expect(measure).not.toHaveBeenCalled();
    expect(observers).toHaveLength(0);
  });

  it('measures once without ResizeObserver', () => {
    const measure = vi.fn();
    renderHook(() => useObservedMeasure(() => [document.createElement('div')], measure, []));
    expect(measure).toHaveBeenCalledTimes(1);
  });
});
