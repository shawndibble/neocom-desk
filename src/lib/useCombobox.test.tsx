import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCombobox } from './useCombobox';

function key(k: string) {
  const preventDefault = vi.fn();
  return { event: { key: k, preventDefault } as unknown as KeyboardEvent, preventDefault };
}

describe('useCombobox', () => {
  it('starts with nothing active and ids tied to the list', () => {
    const { result } = renderHook(() => useCombobox({ count: 3, open: true }));
    expect(result.current.highlight).toBeNull();
    expect(result.current.inputProps.role).toBe('combobox');
    expect(result.current.inputProps['aria-autocomplete']).toBe('list');
    expect(result.current.inputProps['aria-expanded']).toBe(true);
    expect(result.current.inputProps['aria-controls']).toBe(result.current.listboxProps.id);
    expect(result.current.inputProps['aria-activedescendant']).toBeUndefined();
    expect(result.current.optionProps(1).id).toBe(result.current.optionId(1));
  });

  it('moves with arrows (wrapping), Home and End, and swallows the key', () => {
    const { result } = renderHook(() => useCombobox({ count: 3, open: true }));
    const down = key('ArrowDown');
    let handled = false;
    act(() => {
      handled = result.current.handleNavKey(down.event);
    });
    expect(handled).toBe(true);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(result.current.highlight).toBe(0);
    act(() => void result.current.handleNavKey(key('ArrowUp').event));
    expect(result.current.highlight).toBe(2);
    act(() => void result.current.handleNavKey(key('Home').event));
    expect(result.current.highlight).toBe(0);
    act(() => void result.current.handleNavKey(key('End').event));
    expect(result.current.highlight).toBe(2);
    expect(result.current.inputProps['aria-activedescendant']).toBe(result.current.optionId(2));
    expect(result.current.optionProps(2)['aria-selected']).toBe(true);
    expect(result.current.optionProps(0)['aria-selected']).toBe(false);
  });

  it('leaves other keys, and every key with an empty list, alone', () => {
    const { result, rerender } = renderHook(({ count }) => useCombobox({ count, open: true }), {
      initialProps: { count: 3 },
    });
    const enter = key('Enter');
    expect(result.current.handleNavKey(enter.event)).toBe(false);
    expect(enter.preventDefault).not.toHaveBeenCalled();
    rerender({ count: 0 });
    const home = key('Home');
    expect(result.current.handleNavKey(home.event)).toBe(false);
    expect(home.preventDefault).not.toHaveBeenCalled();
  });

  it('drops the active option and the controls link while closed', () => {
    const { result, rerender } = renderHook(({ open }) => useCombobox({ count: 2, open }), {
      initialProps: { open: true },
    });
    act(() => void result.current.handleNavKey(key('ArrowDown').event));
    rerender({ open: false });
    expect(result.current.inputProps['aria-expanded']).toBe(false);
    expect(result.current.inputProps['aria-controls']).toBeUndefined();
    expect(result.current.inputProps['aria-activedescendant']).toBeUndefined();
  });

  it('falls back to a caller default until the keyboard chooses', () => {
    const { result } = renderHook(() => useCombobox({ count: 3, open: true, fallback: 0 }));
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.inputProps['aria-activedescendant']).toBe(result.current.optionId(0));
    act(() => void result.current.handleNavKey(key('ArrowDown').event));
    expect(result.current.highlight).toBe(1);
  });

  it('clamps the active index when the list shrinks', () => {
    const { result, rerender } = renderHook(({ count }) => useCombobox({ count, open: true }), {
      initialProps: { count: 5 },
    });
    act(() => void result.current.handleNavKey(key('End').event));
    rerender({ count: 2 });
    expect(result.current.activeIndex).toBe(1);
    expect(result.current.highlight).toBe(1);
    rerender({ count: 0 });
    expect(result.current.activeIndex).toBeNull();
  });

  it('reset clears the highlight', () => {
    const { result } = renderHook(() => useCombobox({ count: 3, open: true }));
    act(() => void result.current.handleNavKey(key('End').event));
    act(() => result.current.reset());
    expect(result.current.highlight).toBeNull();
  });
});
