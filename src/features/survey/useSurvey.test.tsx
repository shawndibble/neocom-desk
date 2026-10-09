import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SurveyScan } from '@/engine/survey/series';

const { loadSurvey } = vi.hoisted(() => ({ loadSurvey: vi.fn() }));
vi.mock('./surveyStore', () => ({ loadSurvey }));

import { SURVEY_POLL_MS, useSurvey } from './useSurvey';

const ID = 'abc123XYZ';
const scan = (at: number): SurveyScan => ({ at, rocks: [{ ore: 'Veldspar', volume: 100 }] });
const ok = (scans: SurveyScan[]) => ({ ok: true, expiresAt: 5, scans });

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SURVEY_POLL_MS);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  loadSurvey.mockReset();
});

describe('useSurvey polling', () => {
  it('keeps the very same state when a poll finds nothing new, so nothing re-renders', async () => {
    loadSurvey.mockResolvedValue(ok([scan(1)]));
    const { result } = renderHook(() => useSurvey(ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const first = result.current.state;
    expect(first.status).toBe('ready');
    loadSurvey.mockResolvedValue(ok([scan(1)]));
    await tick();
    expect(result.current.state).toBe(first);
  });

  it('takes a poll that has a new scan', async () => {
    loadSurvey.mockResolvedValue(ok([scan(1)]));
    const { result } = renderHook(() => useSurvey(ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    loadSurvey.mockResolvedValue(ok([scan(1), scan(2)]));
    await tick();
    expect(result.current.state).toMatchObject({ status: 'ready' });
    expect((result.current.state as { scans: SurveyScan[] }).scans).toHaveLength(2);
  });

  it('keeps showing the survey through a failed poll instead of swapping in an error', async () => {
    loadSurvey.mockResolvedValue(ok([scan(1)]));
    const { result } = renderHook(() => useSurvey(ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    loadSurvey.mockResolvedValue({ ok: false, reason: 'failed' });
    await tick();
    expect(result.current.state.status).toBe('ready');
  });
});
