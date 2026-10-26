import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { CorpBookView } from './corpBookView';
import { useAutoClaimDonations } from './useAutoClaimDonations';

const claim = vi.hoisted(() => vi.fn());
vi.mock('./corpBookStore', () => ({ claimCorpTaxBookPayment: claim }));

const view = (ids: string[]) =>
  ({
    claims: ids.map((id) => ({
      corporationId: 9,
      payment: { id, characterId: 7 },
    })),
  }) as unknown as CorpBookView;

describe('useAutoClaimDonations', () => {
  it('claims each of the caller own unmatched donations once, then reloads', async () => {
    claim.mockReset();
    claim.mockResolvedValue({ minerId: 'solo:7' });
    const reload = vi.fn();
    const { result, rerender } = renderHook(({ v }) => useAutoClaimDonations(v, reload), {
      initialProps: { v: view(['a', 'b']) },
    });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(claim).toHaveBeenCalledTimes(2);
    expect(claim).toHaveBeenCalledWith(7, 9, 'a');
    expect(claim).toHaveBeenCalledWith(7, 9, 'b');
    expect(result.current.failed.size).toBe(0);
    // The same donations still listed before the reload lands are not claimed again.
    rerender({ v: view(['a', 'b']) });
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it('reports a donation whose claim failed and does not retry it by itself', async () => {
    claim.mockReset();
    claim.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ minerId: 'x' });
    const reload = vi.fn();
    const { result, rerender } = renderHook(({ v }) => useAutoClaimDonations(v, reload), {
      initialProps: { v: view(['a', 'b']) },
    });
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect([...result.current.failed]).toEqual(['9:a']);
    rerender({ v: view(['a']) });
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a view or claims', () => {
    claim.mockReset();
    const reload = vi.fn();
    renderHook(() => useAutoClaimDonations(null, reload));
    renderHook(() => useAutoClaimDonations(view([]), reload));
    expect(claim).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
