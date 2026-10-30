import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';
import { configureClipboard } from '@/lib/clipboard';
import type { AppraisalOutcome } from './appraisalData';
import { useAppraisalCopyLists } from './useAppraisalCopyLists';

function outcome(item: Partial<AppraisalItem>): AppraisalOutcome {
  return {
    appraisal: buildAppraisal(
      [{ typeId: 1, name: 'Tritanium', quantity: 1, buy: 1, sell: 1_000, ...item }],
      100
    ),
    unmatched: [],
    implantBonusPct: 0,
    refinesOreOrIce: false,
    accountingLevel: null,
    brokerRelationsLevel: null,
    pricesUnreachable: false,
  };
}

describe('useAppraisalCopyLists with live prices', () => {
  it('copies the settled live price, not the cached row on screen', async () => {
    const write = vi.fn(async () => {});
    configureClipboard(write);
    const cached = outcome({ priceState: 'cached', sell: 1_000 });
    const live = outcome({ priceState: 'live', sell: 800 });
    const { result } = renderHook(() =>
      useAppraisalCopyLists({ result: cached, owned: null, settleLive: async () => live })
    );

    await act(async () => result.current.handleCopy('list'));

    expect(write).toHaveBeenCalledWith('Tritanium\t799.90');
  });

  it('copies one tick under a rival and the same price when the pilot is cheapest', async () => {
    const write = vi.fn(async () => {});
    configureClipboard(write);
    const own = outcome({ priceState: 'live', sell: 800, sellIsOwn: true });
    const { result } = renderHook(() =>
      useAppraisalCopyLists({ result: own, owned: null, settleLive: async () => own })
    );
    await act(async () => result.current.handleCopy('list'));
    expect(write).toHaveBeenCalledWith('Tritanium\t800');
  });
  it('marks the copy pending while waiting for live prices and ignores a repeat click', async () => {
    const write = vi.fn(async () => {});
    configureClipboard(write);
    const cached = outcome({ priceState: 'cached', sell: 1_000 });
    const live = outcome({ priceState: 'live', sell: 800 });
    let release: (value: AppraisalOutcome) => void = () => {};
    const settleLive = vi.fn(() => new Promise<AppraisalOutcome>((resolve) => (release = resolve)));
    const { result } = renderHook(() =>
      useAppraisalCopyLists({ result: cached, owned: null, settleLive })
    );

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.handleCopy('list');
    });
    expect(result.current.pending).toBe('list');
    await act(async () => result.current.handleCopy('sellNow'));
    expect(settleLive).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(live);
      await first;
    });
    expect(result.current.pending).toBeNull();
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.copied?.list).toBe('list');
  });
});
