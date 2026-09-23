import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useScopedState } from './useScopedState';

describe('useScopedState', () => {
  it('holds a value while its scope is unchanged', () => {
    const entries = [1];
    const { result, rerender } = renderHook(({ scope }) => useScopedState<string>(scope), {
      initialProps: { scope: ['plan-1', entries] as const },
    });
    act(() => result.current[1]('saved'));
    expect(result.current[0]).toBe('saved');
    // A fresh tuple with the same members is the same scope.
    rerender({ scope: ['plan-1', entries] as const });
    expect(result.current[0]).toBe('saved');
  });

  it('reads null once any scope member changes identity', () => {
    const { result, rerender } = renderHook(({ scope }) => useScopedState<string>(scope), {
      initialProps: { scope: ['plan-1', [1]] as readonly unknown[] },
    });
    act(() => result.current[1]('saved'));
    rerender({ scope: ['plan-1', [1]] });
    expect(result.current[0]).toBeNull();
  });

  it('keeps a value set after the scope moved on', () => {
    const { result, rerender } = renderHook(({ scope }) => useScopedState<string>(scope), {
      initialProps: { scope: ['plan-1'] as readonly unknown[] },
    });
    rerender({ scope: ['plan-2'] });
    act(() => result.current[1]('for plan 2'));
    expect(result.current[0]).toBe('for plan 2');
  });

  it('clears on null', () => {
    const { result } = renderHook(() => useScopedState<boolean>(['plan-1']));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
  });
});
