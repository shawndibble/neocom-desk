import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';

let basis = {
  key: 'shortest',
  hydrated: true,
  rules: { preference: 'shortest', securityPenalty: 50, avoid: [] },
  network: {},
  podKillsUnavailable: false,
};
const jumpsBetween = vi.fn<(from: number, to: number, basis: unknown) => Promise<JumpsAwayResult>>(
  async () => ({ kind: 'known', jumps: 9 })
);
vi.mock('@/features/route/jumpBasis', () => ({
  useJumpBasis: () => basis,
  jumpsBetween: (from: number, to: number, b: unknown) => jumpsBetween(from, to, b),
}));

const { useHubJumps } = await import('./useHubJumps');

const JITA = 30000142;
const AMARR = 30002187;

beforeEach(() => {
  jumpsBetween.mockClear();
  basis = {
    ...basis,
    key: 'shortest',
    hydrated: true,
    rules: { ...basis.rules, preference: 'shortest' },
  };
});

describe('useHubJumps', () => {
  it('has no single figure when either end is Any hub', () => {
    expect(renderHook(() => useHubJumps(null, AMARR)).result.current).toEqual({ status: 'none' });
    expect(renderHook(() => useHubJumps(JITA, null)).result.current).toEqual({ status: 'none' });
    expect(jumpsBetween).not.toHaveBeenCalled();
  });

  it('counts the jumps between the hubs, labelled with the route preference', async () => {
    const { result } = renderHook(() => useHubJumps(JITA, AMARR));
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'known', jumps: 9, preference: 'shortest' })
    );
    expect(jumpsBetween).toHaveBeenCalledWith(JITA, AMARR, basis);
  });

  it('waits for the jump basis to be read before counting', () => {
    basis = { ...basis, hydrated: false };
    const { result } = renderHook(() => useHubJumps(JITA, AMARR));
    expect(result.current).toEqual({ status: 'loading' });
    expect(jumpsBetween).not.toHaveBeenCalled();
  });

  it('says unknown when there is no route, or the count fails', async () => {
    jumpsBetween.mockResolvedValueOnce({ kind: 'unknown', reason: 'noRoute' });
    const noRoute = renderHook(() => useHubJumps(JITA, AMARR));
    await waitFor(() => expect(noRoute.result.current).toEqual({ status: 'unknown' }));

    jumpsBetween.mockRejectedValueOnce(new Error('snapshot unreadable'));
    const failed = renderHook(() => useHubJumps(JITA, 30002659));
    await waitFor(() => expect(failed.result.current).toEqual({ status: 'unknown' }));
  });

  it('counts again when the route preference changes, never showing the old count', async () => {
    const { result, rerender } = renderHook(() => useHubJumps(JITA, AMARR));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'known', jumps: 9 }));

    jumpsBetween.mockResolvedValueOnce({ kind: 'known', jumps: 14 });
    basis = {
      ...basis,
      key: 'prefer-highsec',
      rules: { ...basis.rules, preference: 'prefer-highsec' },
    };
    rerender();
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'known', jumps: 14, preference: 'prefer-highsec' })
    );
  });
});
