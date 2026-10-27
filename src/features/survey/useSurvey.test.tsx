import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SurveyScan } from '@/engine/survey/series';

const { loadSurvey } = vi.hoisted(() => ({ loadSurvey: vi.fn() }));
vi.mock('./surveyStore', () => ({ loadSurvey }));

import {
  SURVEY_IDLE_AFTER_MS,
  SURVEY_IDLE_POLL_MS,
  SURVEY_POLL_MS,
  surveyPollDelay,
  useSurvey,
} from './useSurvey';

const ID = 'abc123XYZ';
const scan = (at: number): SurveyScan => ({ at, rocks: [{ ore: 'Veldspar', volume: 100 }] });
const ok = (scans: SurveyScan[], ignored: string[] = []) => ({
  ok: true,
  expiresAt: 5,
  scans,
  ignored: new Set(ignored),
});

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

  it('takes a poll where only the ignored set changed', async () => {
    loadSurvey.mockResolvedValue(ok([scan(1), scan(2)]));
    const { result } = renderHook(() => useSurvey(ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    loadSurvey.mockResolvedValue(ok([scan(1), scan(2)], ['x']));
    await tick();
    expect((result.current.state as { ignored: ReadonlySet<string> }).ignored.has('x')).toBe(true);
  });

  it('re-reads at once when the window regains focus after the minimum gap', async () => {
    loadSurvey.mockResolvedValue(ok([scan(1)]));
    const { result } = renderHook(() => useSurvey(ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    loadSurvey.mockResolvedValue(ok([scan(1), scan(2)]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect((result.current.state as { scans: SurveyScan[] }).scans).toHaveLength(2);
  });

  it('does not re-read on focus right after a read', async () => {
    loadSurvey.mockResolvedValue(ok([scan(1)]));
    renderHook(() => useSurvey(ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      window.dispatchEvent(new Event('focus'));
    });
    expect(loadSurvey).toHaveBeenCalledTimes(1);
  });

  it('re-reads when the tab becomes visible again', async () => {
    loadSurvey.mockResolvedValue(ok([scan(1)]));
    const { result } = renderHook(() => useSurvey(ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    loadSurvey.mockResolvedValue(ok([scan(1), scan(2)]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect((result.current.state as { scans: SurveyScan[] }).scans).toHaveLength(2);
  });

  it('slows down once no new scan has come in for a while, and speeds up when one does', async () => {
    loadSurvey.mockResolvedValue(ok([scan(1)]));
    renderHook(() => useSurvey(ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SURVEY_IDLE_AFTER_MS);
    });
    const busy = loadSurvey.mock.calls.length;
    expect(busy).toBe(1 + SURVEY_IDLE_AFTER_MS / SURVEY_POLL_MS);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SURVEY_IDLE_POLL_MS - 1);
    });
    expect(loadSurvey).toHaveBeenCalledTimes(busy);
    loadSurvey.mockResolvedValue(ok([scan(1), scan(2)]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadSurvey).toHaveBeenCalledTimes(busy + 1);
    // A new scan came in: back to the quick pace.
    await tick();
    expect(loadSurvey).toHaveBeenCalledTimes(busy + 2);
  });
});

describe('surveyPollDelay', () => {
  it('polls quickly while scans are coming in, and slowly once the field is quiet', () => {
    expect(surveyPollDelay(0)).toBe(SURVEY_POLL_MS);
    expect(surveyPollDelay(SURVEY_IDLE_AFTER_MS - 1)).toBe(SURVEY_POLL_MS);
    expect(surveyPollDelay(SURVEY_IDLE_AFTER_MS)).toBe(SURVEY_IDLE_POLL_MS);
  });
});
