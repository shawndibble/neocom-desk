import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVisualViewportBox } from './useVisualViewportBox';

function fakeViewport(height: number, offsetTop = 0) {
  const target = new EventTarget() as EventTarget & { height: number; offsetTop: number };
  target.height = height;
  target.offsetTop = offsetTop;
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: target });
  return target;
}

afterEach(() => {
  Reflect.deleteProperty(window, 'visualViewport');
});

describe('useVisualViewportBox', () => {
  it('is null where visualViewport is missing', () => {
    const { result } = renderHook(() => useVisualViewportBox(true));
    expect(result.current).toBeNull();
  });

  it('follows the keyboard shrinking and restoring the viewport', () => {
    const vv = fakeViewport(800);
    const { result } = renderHook(() => useVisualViewportBox(true));
    expect(result.current).toEqual({ height: 800, offsetTop: 0 });
    act(() => {
      vv.height = 500;
      vv.offsetTop = 12;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toEqual({ height: 500, offsetTop: 12 });
  });

  it('is null while inactive', () => {
    fakeViewport(800);
    const { result } = renderHook(() => useVisualViewportBox(false));
    expect(result.current).toBeNull();
  });
});
