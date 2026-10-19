import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStableCallback } from './useStableCallback';

describe('useStableCallback', () => {
  it('keeps identity but calls the latest function', () => {
    const { result, rerender } = renderHook(({ n }) => useStableCallback(() => n), {
      initialProps: { n: 1 },
    });
    const first = result.current;
    rerender({ n: 2 });
    expect(result.current).toBe(first);
    expect(first()).toBe(2);
  });
});
