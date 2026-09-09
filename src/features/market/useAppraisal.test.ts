import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { useAppraisal } from './useAppraisal';
import type { AppraisalOutcome } from './appraisalData';

const appraisePaste = vi.hoisted(() => vi.fn());
vi.mock('./appraisalData', () => ({ appraisePaste }));

function outcome(sell: number): AppraisalOutcome {
  return {
    appraisal: {
      rows: [],
      totals: { buy: 0, sell, spread: sell, unpricedRows: 0, refine: 0, refineUnpricedRows: 0 },
    },
    unmatched: [],
  };
}

beforeEach(() => {
  appraisePaste.mockReset();
  appraisePaste.mockResolvedValue(outcome(100));
});

describe('useAppraisal', () => {
  it('does not price anything until Appraise is pressed', async () => {
    const { result } = renderHook(() => useAppraisal(DEFAULT_TRADE_HUB, 90, null));

    act(() => result.current.setText('Tritanium 5'));
    await waitFor(() => expect(result.current.canAppraise).toBe(true));

    expect(appraisePaste).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
  });

  it('prices the submitted text on Appraise', async () => {
    const { result } = renderHook(() => useAppraisal(DEFAULT_TRADE_HUB, 90, null));

    act(() => result.current.setText('Tritanium 5'));
    act(() => result.current.appraise());

    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(appraisePaste).toHaveBeenCalledWith('Tritanium 5', DEFAULT_TRADE_HUB, 90, null, {
      force: false,
    });
  });

  /**
   * The percentage is pure arithmetic and the hub's prices are usually
   * cached, so making the pilot press the button again to see a figure that
   * has already changed would just be a stale screen with a button on it.
   */
  it('re-prices on its own when the percentage changes', async () => {
    const { result, rerender } = renderHook(
      ({ percent }) => useAppraisal(DEFAULT_TRADE_HUB, percent, null),
      { initialProps: { percent: 90 } }
    );

    act(() => result.current.setText('Tritanium 5'));
    act(() => result.current.appraise());
    await waitFor(() => expect(appraisePaste).toHaveBeenCalledTimes(1));

    rerender({ percent: 80 });
    await waitFor(() => expect(appraisePaste).toHaveBeenCalledTimes(2));
    expect(appraisePaste).toHaveBeenLastCalledWith('Tritanium 5', DEFAULT_TRADE_HUB, 80, null, {
      force: false,
    });
  });

  it('re-prices when the hub changes', async () => {
    const amarr = getTradeHub('amarr')!;
    const { result, rerender } = renderHook(({ hub }) => useAppraisal(hub, 90, null), {
      initialProps: { hub: DEFAULT_TRADE_HUB },
    });

    act(() => result.current.setText('Tritanium 5'));
    act(() => result.current.appraise());
    await waitFor(() => expect(appraisePaste).toHaveBeenCalledTimes(1));

    rerender({ hub: amarr });
    await waitFor(() => expect(appraisePaste).toHaveBeenCalledTimes(2));
    expect(appraisePaste).toHaveBeenLastCalledWith('Tritanium 5', amarr, 90, null, {
      force: false,
    });
  });

  /** AC: switching the active Character recomputes every row from scratch. */
  it('re-prices when the active Character changes', async () => {
    const { result, rerender } = renderHook(
      ({ characterId }) => useAppraisal(DEFAULT_TRADE_HUB, 90, characterId),
      { initialProps: { characterId: null as number | null } }
    );

    act(() => result.current.setText('Tritanium 5'));
    act(() => result.current.appraise());
    await waitFor(() => expect(appraisePaste).toHaveBeenCalledTimes(1));

    rerender({ characterId: 42 });
    await waitFor(() => expect(appraisePaste).toHaveBeenCalledTimes(2));
    expect(appraisePaste).toHaveBeenLastCalledWith('Tritanium 5', DEFAULT_TRADE_HUB, 90, 42, {
      force: false,
    });
  });

  it('bypasses the price cache on refresh, and only that once', async () => {
    const { result, rerender } = renderHook(
      ({ percent }) => useAppraisal(DEFAULT_TRADE_HUB, percent, null),
      { initialProps: { percent: 90 } }
    );

    act(() => result.current.setText('Tritanium 5'));
    act(() => result.current.appraise());
    await waitFor(() => expect(appraisePaste).toHaveBeenCalledTimes(1));

    act(() => result.current.refresh());
    await waitFor(() => expect(appraisePaste).toHaveBeenCalledTimes(2));
    expect(appraisePaste).toHaveBeenLastCalledWith('Tritanium 5', DEFAULT_TRADE_HUB, 90, null, {
      force: true,
    });

    // The next ordinary re-price must not still be forcing a network round trip.
    rerender({ percent: 80 });
    await waitFor(() => expect(appraisePaste).toHaveBeenCalledTimes(3));
    expect(appraisePaste).toHaveBeenLastCalledWith('Tritanium 5', DEFAULT_TRADE_HUB, 80, null, {
      force: false,
    });
  });

  it('drops the result on Clear', async () => {
    const { result } = renderHook(() => useAppraisal(DEFAULT_TRADE_HUB, 90, null));

    act(() => result.current.setText('Tritanium 5'));
    act(() => result.current.appraise());
    await waitFor(() => expect(result.current.result).not.toBeNull());

    act(() => result.current.clear());
    await waitFor(() => expect(result.current.result).toBeNull());
    expect(result.current.text).toBe('');
  });

  it('reports a catalogue failure without losing the pasted text', async () => {
    appraisePaste.mockRejectedValue(new Error('catalogue down'));
    const { result } = renderHook(() => useAppraisal(DEFAULT_TRADE_HUB, 90, null));

    act(() => result.current.setText('Tritanium 5'));
    act(() => result.current.appraise());

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.result).toBeNull();
    expect(result.current.text).toBe('Tritanium 5');
  });

  it('retries after a failure when Appraise is pressed again', async () => {
    appraisePaste.mockRejectedValueOnce(new Error('catalogue down'));
    const { result } = renderHook(() => useAppraisal(DEFAULT_TRADE_HUB, 90, null));

    act(() => result.current.setText('Tritanium 5'));
    act(() => result.current.appraise());
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.appraise());
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.failed).toBe(false);
  });
});
