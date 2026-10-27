import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useElementNarrowerThan } from './useElementNarrowerThan';

type Callback = (entries: { contentRect: { width: number } }[]) => void;

function stubResizeObserver() {
  const observers: { callback: Callback; disconnect: () => void }[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      callback: Callback;
      constructor(callback: Callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect = vi.fn();
    }
  );
  return (width: number) => act(() => observers.at(-1)!.callback([{ contentRect: { width } }]));
}

afterEach(() => vi.unstubAllGlobals());

describe('useElementNarrowerThan', () => {
  it('follows the element across each threshold, in rem at the root font size', () => {
    const resize = stubResizeObserver();
    const { result } = renderHook(() => useElementNarrowerThan<HTMLDivElement>([56, 46]));
    act(() => result.current[0](document.createElement('div')));

    resize(895);
    expect(result.current[1]).toEqual([true, false]);
    resize(735);
    expect(result.current[1]).toEqual([true, true]);
    resize(896);
    expect(result.current[1]).toEqual([false, false]);
  });

  it('reads as wide with no element yet', () => {
    stubResizeObserver();
    const { result } = renderHook(() => useElementNarrowerThan<HTMLDivElement>([56, 46]));
    expect(result.current[1]).toEqual([false, false]);
  });
});
