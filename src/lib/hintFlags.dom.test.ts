import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  claimSessionHint,
  dismissSessionHint,
  releaseSessionHint,
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

    act(() => dismissSessionHint('rowHint:x'));
    expect(result.current).toBe(true);
    act(() => dismissSessionHint('goTo'));
    expect(result.current).toBe(false);
    expect(claimSessionHint('rowHint')).toBe(false);
  });
});

describe('releaseSessionHint', () => {
  it('frees an unanswered hint for another owner, never a dismissed one', () => {
    claimSessionHint('rowHint:a');
    releaseSessionHint('rowHint:a');
    expect(claimSessionHint('rowHint:b')).toBe(true);

    dismissSessionHint('rowHint:b');
    releaseSessionHint('rowHint:b');
    expect(claimSessionHint('goTo')).toBe(false);
  });
});
