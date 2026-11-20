import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const claim = vi.fn<(ids: number[]) => Promise<null>>(async () => null);
vi.mock('@/features/corpTaxBook/playerApi', () => ({
  claimPlayerCharacters: (ids: number[]) => claim(ids),
}));
vi.mock('./syncStatus', () => ({ isSyncConfigured: () => true }));

import { PLAYER_CLAIM_DELAY_MS, usePlayerClaim } from './usePlayerClaim';

beforeEach(() => {
  vi.useFakeTimers();
  claim.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('usePlayerClaim', () => {
  it('claims the stored characters once, after the boot delay', async () => {
    const { rerender } = renderHook(({ ids }) => usePlayerClaim(ids), {
      initialProps: { ids: [2, 1] },
    });
    expect(claim).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PLAYER_CLAIM_DELAY_MS);
    expect(claim).toHaveBeenCalledTimes(1);
    rerender({ ids: [1, 2] });
    await vi.advanceTimersByTimeAsync(PLAYER_CLAIM_DELAY_MS);
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('claims for a single character, so a sold character is dropped from its old owner', async () => {
    renderHook(() => usePlayerClaim([1]));
    await vi.advanceTimersByTimeAsync(PLAYER_CLAIM_DELAY_MS);
    expect(claim).toHaveBeenCalledWith([1]);
  });

  it('does nothing with no characters', async () => {
    renderHook(() => usePlayerClaim([]));
    await vi.advanceTimersByTimeAsync(PLAYER_CLAIM_DELAY_MS);
    expect(claim).not.toHaveBeenCalled();
  });
});
