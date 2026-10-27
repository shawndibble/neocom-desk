import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { useCompareAsync } from './useCompareAsync';

const profile = { skillLevels: new Map() } as unknown as PilotProfile;
const good = { name: 'good' } as unknown as Fitting;
const throws = { name: 'throws' } as unknown as Fitting;
const empty = { name: 'empty' } as unknown as Fitting;

async function compute(fitting: Fitting): Promise<string | null> {
  if (fitting === throws) throw new Error('engine blew up');
  if (fitting === empty) return null;
  return fitting.name;
}

describe('useCompareAsync', () => {
  it('marks a slot failed when its compute throws or comes back empty, and keeps the rest', async () => {
    const fittings = [good, throws, empty, null];
    const { result } = renderHook(() => useCompareAsync(fittings, profile, compute));
    await waitFor(() => expect(result.current.values[0]).toBe('good'));
    expect(result.current.values).toEqual(['good', null, null, null]);
    expect(result.current.failed).toEqual([false, true, true, false]);
  });

  it('retries a failed slot when the compared Fittings change, instead of keeping the failure', async () => {
    let attempts = 0;
    const flaky = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network blip');
      return 'ok';
    };
    const { result, rerender } = renderHook(
      ({ fittings }) => useCompareAsync(fittings, profile, flaky),
      { initialProps: { fittings: [good] as (Fitting | null)[] } }
    );
    await waitFor(() => expect(result.current.failed).toEqual([true]));
    rerender({ fittings: [good, null] });
    await waitFor(() => expect(result.current.values[0]).toBe('ok'));
    expect(result.current.failed).toEqual([false, false]);
  });

  it('reports nothing failed while still waiting on a profile', () => {
    const fittings = [good];
    const { result } = renderHook(() => useCompareAsync(fittings, null, compute));
    expect(result.current).toEqual({ values: [null], failed: [false] });
  });

  it('recomputes on a context change and keeps the old value showing meanwhile', async () => {
    const seen: unknown[] = [];
    let release: () => void = () => {};
    const slow = async (fitting: Fitting, _p: PilotProfile, ctx?: unknown) => {
      seen.push(ctx);
      if (ctx === 'b') await new Promise<void>((resolve) => (release = resolve));
      return `${fitting.name}-${String(ctx)}`;
    };
    const fittings = [good];
    const { result, rerender } = renderHook(
      ({ ctx }) => useCompareAsync(fittings, profile, slow, ctx),
      { initialProps: { ctx: 'a' } }
    );
    await waitFor(() => expect(result.current.values[0]).toBe('good-a'));
    rerender({ ctx: 'b' });
    expect(result.current.values[0]).toBe('good-a');
    release();
    await waitFor(() => expect(result.current.values[0]).toBe('good-b'));
    expect(seen).toEqual(['a', 'b']);
  });

  it('does not recompute an unchanged Fitting when a slot is added', async () => {
    const spy = vi.fn(compute);
    const { result, rerender } = renderHook(
      ({ fittings }) => useCompareAsync(fittings, profile, spy, 'a'),
      { initialProps: { fittings: [good] as (Fitting | null)[] } }
    );
    await waitFor(() => expect(result.current.values[0]).toBe('good'));
    rerender({ fittings: [good, empty] });
    await waitFor(() => expect(result.current.failed[1]).toBe(true));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
