import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { adviceInput } from './map/mapFixtures.testutil';
import { buildPlanAdvice } from './planAdviceModel';
import type { PlanAdviceInput } from './planAdvice/types';

afterEach(() => {
  vi.doUnmock('./planAdviceService');
  vi.resetModules();
});

describe('useAdviceOf without a Worker', () => {
  it('runs the model on the first render', async () => {
    const { useAdviceOf } = await import('./useAdviceOf');
    const input = adviceInput('lean');
    const { result } = renderHook(() => useAdviceOf(input));
    expect(result.current).toEqual({ status: 'ready', advice: buildPlanAdvice(input) });
  });

  it('is pending with no input and an error when the model throws', async () => {
    const { useAdviceOf } = await import('./useAdviceOf');
    expect(renderHook(() => useAdviceOf(null)).result.current).toEqual({ status: 'pending' });
    const bad = { ...adviceInput('lean'), books: null } as never;
    expect(renderHook(() => useAdviceOf(bad)).result.current).toEqual({ status: 'error' });
  });
});

describe('useAdviceOf with a worker', () => {
  async function withService(
    ask: (input: PlanAdviceInput, signal?: AbortSignal) => Promise<unknown>
  ) {
    vi.resetModules();
    class Unavailable extends Error {}
    vi.doMock('./planAdviceService', () => ({
      PlanAdviceWorkerUnavailable: Unavailable,
      planAdviceWorkerAvailable: () => true,
      peekPlanAdvice: () => null,
      askPlanAdvice: ask,
    }));
    return { Unavailable, ...(await import('./useAdviceOf')) };
  }

  it('is pending until the answer lands, then ready', async () => {
    const input = adviceInput('lean');
    const advice = buildPlanAdvice(input);
    const { useAdviceOf } = await withService(() => Promise.resolve(advice));
    const { result } = renderHook(() => useAdviceOf(input));
    expect(result.current).toEqual({ status: 'pending' });
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', advice }));
  });

  it('never shows the previous input under a new one', async () => {
    const a = adviceInput('lean');
    const b = adviceInput('lean');
    const { useAdviceOf } = await withService(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ input }) => useAdviceOf(input), {
      initialProps: { input: a },
    });
    rerender({ input: b });
    expect(result.current).toEqual({ status: 'pending' });
  });

  it('runs the model on the page when the worker fails', async () => {
    const input = adviceInput('lean');
    const { useAdviceOf, Unavailable } = await withService(() =>
      Promise.reject(new Unavailable('worker failed'))
    );
    const { result } = renderHook(() => useAdviceOf(input));
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('withdraws the request when the input changes or the hook unmounts', async () => {
    const signals: AbortSignal[] = [];
    const { useAdviceOf } = await withService((_input, signal) => {
      signals.push(signal as AbortSignal);
      return new Promise(() => {});
    });
    const a = adviceInput('lean');
    const b = adviceInput('lean');
    const { rerender, unmount } = renderHook(({ input }) => useAdviceOf(input), {
      initialProps: { input: a },
    });
    rerender({ input: b });
    expect(signals.map((s) => s.aborted)).toEqual([true, false]);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it('is an error when the worker says the model threw', async () => {
    const { useAdviceOf } = await withService(() => Promise.reject(new Error('boom')));
    const input = adviceInput('lean');
    const { result } = renderHook(() => useAdviceOf(input));
    await waitFor(() => expect(result.current).toEqual({ status: 'error' }));
  });

  it('returns one result object across renders once ready', async () => {
    const input = adviceInput('lean');
    const advice = buildPlanAdvice(input);
    const { useAdviceOf } = await withService(() => Promise.resolve(advice));
    const { result, rerender } = renderHook(() => useAdviceOf(input));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('keeps the last answer while a same-colonies input is pending, never another pilot’s', async () => {
    const a = adviceInput('lean');
    const sameColonies = { ...a, preference: 'least-hauling' as never };
    const otherPilot = { ...adviceInput('lean') };
    const advice = buildPlanAdvice(a);
    let calls = 0;
    const { useAdviceOf } = await withService(() =>
      ++calls === 1 ? Promise.resolve(advice) : new Promise(() => {})
    );
    const { result, rerender } = renderHook(({ input }) => useAdviceOf(input), {
      initialProps: { input: a },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ input: sameColonies });
    expect(result.current).toEqual({ status: 'ready', advice });
    rerender({ input: otherPilot });
    expect(result.current).toEqual({ status: 'pending' });
  });

  it('keeps the last answer while the same Character’s re-read colonies are pending', async () => {
    const a = adviceInput('lean');
    const reRead = { ...a, snapshot: { ...a.snapshot } };
    const advice = buildPlanAdvice(a);
    let calls = 0;
    const { useAdviceOf } = await withService(() =>
      ++calls === 1 ? Promise.resolve(advice) : new Promise(() => {})
    );
    // After `withService`'s module reset, so this is the instance `useAdviceOf` reads.
    const { markReRead } = await import('./snapshotLineage');
    markReRead(reRead.snapshot, a.snapshot);
    const { result, rerender } = renderHook(({ input }) => useAdviceOf(input), {
      initialProps: { input: a },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ input: reRead });
    expect(result.current).toEqual({ status: 'ready', advice });
  });

  it('replaces the held answer with the error when a recompute fails', async () => {
    const a = adviceInput('lean');
    const reRead = { ...a, snapshot: { ...a.snapshot } };
    const advice = buildPlanAdvice(a);
    let calls = 0;
    const { useAdviceOf } = await withService(() =>
      ++calls === 1 ? Promise.resolve(advice) : Promise.reject(new Error('boom'))
    );
    const { markReRead } = await import('./snapshotLineage');
    markReRead(reRead.snapshot, a.snapshot);
    const { result, rerender } = renderHook(({ input }) => useAdviceOf(input), {
      initialProps: { input: a },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ input: reRead });
    await waitFor(() => expect(result.current).toEqual({ status: 'error' }));
  });
});
