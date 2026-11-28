import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChangedSinceMount } from './useChangedSinceMount';

describe('useChangedSinceMount', () => {
  it('stays false until the value first changes, then stays true', () => {
    const { result, rerender } = renderHook(({ open }) => useChangedSinceMount(open), {
      initialProps: { open: false },
    });
    expect(result.current).toBe(false);
    rerender({ open: false });
    expect(result.current).toBe(false);
    rerender({ open: true });
    expect(result.current).toBe(true);
    rerender({ open: false });
    expect(result.current).toBe(true);
  });
});
