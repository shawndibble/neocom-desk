import { describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import { renderHook } from '@testing-library/react';
import {
  resolveCharacterFilter,
  toStoredCharacterFilterValue,
  fromStoredCharacterFilterValue,
  isStoredCharacterFilterValue,
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from './characterFilterValue';

describe('resolveCharacterFilter', () => {
  it('resolves "current" to just the active Character', () => {
    expect(resolveCharacterFilter('current', 42)).toEqual(new Set([42]));
  });

  it('resolves "current" to "all" when there is no active Character', () => {
    expect(resolveCharacterFilter('current', null)).toBe('all');
  });

  it('passes "all" through unchanged', () => {
    expect(resolveCharacterFilter('all', 42)).toBe('all');
  });

  it('passes a concrete subset through unchanged', () => {
    const subset = new Set([1, 2]);
    expect(resolveCharacterFilter(subset, 42)).toBe(subset);
  });
});

describe('toStoredCharacterFilterValue / fromStoredCharacterFilterValue', () => {
  it('round-trips "current"', () => {
    expect(fromStoredCharacterFilterValue(toStoredCharacterFilterValue('current'))).toBe('current');
  });

  it('round-trips "all"', () => {
    expect(fromStoredCharacterFilterValue(toStoredCharacterFilterValue('all'))).toBe('all');
  });

  it('round-trips a concrete subset as a sorted plain array', () => {
    const stored = toStoredCharacterFilterValue(new Set([3, 1, 2]));
    expect(stored).toEqual([1, 2, 3]);
    expect(fromStoredCharacterFilterValue(stored)).toEqual(new Set([1, 2, 3]));
  });
});

describe('useResolvedCharacterFilter', () => {
  it('returns a referentially stable result across re-renders with unchanged inputs', () => {
    const { result, rerender } = renderHook(
      ({
        value,
        activeCharacterId,
      }: {
        value: CharacterFilterValue;
        activeCharacterId: number | null;
      }) => useResolvedCharacterFilter(value, activeCharacterId),
      { initialProps: { value: 'current' as CharacterFilterValue, activeCharacterId: 42 } }
    );
    const first = result.current;
    rerender({ value: 'current', activeCharacterId: 42 });
    expect(result.current).toBe(first);
  });

  it('re-resolves when the active Character changes', () => {
    const { result, rerender } = renderHook(
      ({
        value,
        activeCharacterId,
      }: {
        value: CharacterFilterValue;
        activeCharacterId: number | null;
      }) => useResolvedCharacterFilter(value, activeCharacterId),
      { initialProps: { value: 'current' as CharacterFilterValue, activeCharacterId: 42 } }
    );
    const first = result.current;
    rerender({ value: 'current', activeCharacterId: 7 });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(new Set([7]));
  });

  it('re-resolves when the filter value itself changes', () => {
    const { result, rerender } = renderHook(
      ({
        value,
        activeCharacterId,
      }: {
        value: CharacterFilterValue;
        activeCharacterId: number | null;
      }) => useResolvedCharacterFilter(value, activeCharacterId),
      { initialProps: { value: 'current' as CharacterFilterValue, activeCharacterId: 42 } }
    );
    rerender({ value: 'all', activeCharacterId: 42 });
    expect(result.current).toBe('all');
  });

  // Regression test for issue #675 (React error #185, commit c39a9e7): a
  // caller that feeds the resolved filter into an effect's dependency array
  // must not have that effect re-fire on every render just because
  // `resolveCharacterFilter('current', ...)` allocates a fresh Set per call.
  it('does not re-fire a downstream effect on every render (issue #675 regression)', () => {
    const effect = vi.fn();
    const { rerender } = renderHook(
      ({
        value,
        activeCharacterId,
      }: {
        value: CharacterFilterValue;
        activeCharacterId: number | null;
      }) => {
        const resolved = useResolvedCharacterFilter(value, activeCharacterId);
        useEffect(() => {
          effect(resolved);
        }, [resolved]);
      },
      { initialProps: { value: 'current' as CharacterFilterValue, activeCharacterId: 42 } }
    );
    expect(effect).toHaveBeenCalledTimes(1);

    rerender({ value: 'current', activeCharacterId: 42 });
    rerender({ value: 'current', activeCharacterId: 42 });
    rerender({ value: 'current', activeCharacterId: 42 });
    expect(effect).toHaveBeenCalledTimes(1);

    rerender({ value: 'current', activeCharacterId: 7 });
    expect(effect).toHaveBeenCalledTimes(2);
  });
});

describe('isStoredCharacterFilterValue', () => {
  it.each(['current', 'all', [], [1, 2]])('accepts %j', (value) => {
    expect(isStoredCharacterFilterValue(value)).toBe(true);
  });

  it.each([null, undefined, 42, 'other', ['1', 2], { mode: 'all' }])('rejects %j', (value) => {
    expect(isStoredCharacterFilterValue(value)).toBe(false);
  });

  it.each([[0], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 1], [NaN]])(
    'rejects an id that is not a positive safe integer: %j',
    (value) => {
      expect(isStoredCharacterFilterValue(value)).toBe(false);
    }
  );
});
