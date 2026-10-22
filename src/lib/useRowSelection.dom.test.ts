import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRowSelection } from './useRowSelection';

describe('useRowSelection', () => {
  it('toggles single rows', () => {
    const { result } = renderHook(() => useRowSelection('ctx', [1, 2, 3]));
    act(() => result.current.toggle(2));
    expect([...result.current.selected]).toEqual([2]);
    act(() => result.current.toggle(2));
    expect(result.current.selected.size).toBe(0);
  });

  it('select all covers only the visible keys; none clears', () => {
    const { result, rerender } = renderHook(({ keys }) => useRowSelection('ctx', keys), {
      initialProps: { keys: [1, 2] },
    });
    act(() => result.current.selectAll());
    expect([...result.current.selected].sort()).toEqual([1, 2]);
    // A key that stops being visible drops out of what is selected.
    rerender({ keys: [2] });
    expect([...result.current.selected]).toEqual([2]);
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });

  it('clears when the context changes, and stays cleared if it changes back', () => {
    const { result, rerender } = renderHook(({ ctx }) => useRowSelection(ctx, [1, 2]), {
      initialProps: { ctx: 'a' },
    });
    act(() => result.current.toggle(1));
    rerender({ ctx: 'b' });
    expect(result.current.selected.size).toBe(0);
    rerender({ ctx: 'a' });
    expect(result.current.selected.size).toBe(0);
  });
});
