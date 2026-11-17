import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRouteSnapshots } from '@/lib/routeSnapshotCache';
import type { MadePaymentsResult } from './madePayments';
import { useMadePayments } from './useMadePayments';

const load = vi.fn<() => Promise<MadePaymentsResult>>();
vi.mock('./madePayments', () => ({ loadMadePaymentsWithStatus: () => load() }));

const payment = { key: 'p1', amount: 5 } as unknown as MadePaymentsResult['payments'][number];
const ok = { characterId: 7, journal: 'ok', contracts: 'ok' } as const;
const failedJournal = { characterId: 7, journal: 'failed', contracts: 'ok' } as const;

describe('useMadePayments retention', () => {
  beforeEach(() => {
    resetRouteSnapshots();
    load.mockReset();
  });

  it('starts a later mount on the last good payments, before its own read lands', async () => {
    load.mockResolvedValueOnce({ payments: [payment], sources: [ok] });
    const first = renderHook(() => useMadePayments('7', 7));
    await waitFor(() => expect(first.result.current.madePayments).toEqual([payment]));
    first.unmount();

    load.mockReturnValueOnce(new Promise(() => undefined));
    const second = renderHook(() => useMadePayments('7', 7));
    expect(second.result.current.madePayments).toEqual([payment]);
  });

  it('keeps the last complete read when a later one lost a source', async () => {
    load.mockResolvedValueOnce({ payments: [payment], sources: [ok] });
    const first = renderHook(() => useMadePayments('7', 7));
    await waitFor(() => expect(first.result.current.madePayments).toEqual([payment]));
    first.unmount();

    load.mockResolvedValueOnce({ payments: [], sources: [failedJournal] });
    const second = renderHook(() => useMadePayments('7', 7));
    await act(async () => {
      await Promise.resolve();
    });
    expect(second.result.current.madePayments).toEqual([payment]);
    expect(second.result.current.paymentSources).toEqual([failedJournal]);
  });

  it('does not offer another roster the stored payments', async () => {
    load.mockResolvedValueOnce({ payments: [payment], sources: [ok] });
    const first = renderHook(() => useMadePayments('7', 7));
    await waitFor(() => expect(first.result.current.madePayments).toEqual([payment]));
    first.unmount();

    load.mockReturnValueOnce(new Promise(() => undefined));
    const other = renderHook(() => useMadePayments('7,8', 7));
    expect(other.result.current.madePayments).toEqual([]);
  });
});
