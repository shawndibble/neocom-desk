import { describe, expect, it } from 'vitest';
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
});
