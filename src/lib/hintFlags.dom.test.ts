import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  claimSessionHint,
  dismissSessionHint,
  resetSessionHints,
  useSessionHintShown,
} from './hintFlags';

beforeEach(() => resetSessionHints());

describe('useSessionHintShown', () => {
  it('shows for the holder until the session hint is dismissed, which spends it for everyone', () => {
    const { result } = renderHook(() => useSessionHintShown('goTo'));
    expect(result.current).toBe(false);

    act(() => void claimSessionHint('goTo'));
    expect(result.current).toBe(true);

    act(() => dismissSessionHint());
    expect(result.current).toBe(false);
    expect(claimSessionHint('rowHint')).toBe(false);
  });
});
