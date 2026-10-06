import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { RebuildPreference } from '@/engine/pi/planAdvice';
import type { GoalPlannerSnapshot } from '../goalPlannerSnapshot';
import { buildPlanAdvice } from '../planAdviceModel';
import { planPicks } from '../planPicks';
import { usePlanPreference } from '../planTicksPref';
import { adviceInput, snapshot } from './mapFixtures.testutil';

const seen: RebuildPreference[] = [];
let pricesDown = false;
vi.mock('../goalPlannerSnapshot', () => ({
  loadGoalPlannerSnapshot: async () => ({
    ...snapshot('lean'),
    systemNames: new Map(),
    planetNames: new Map(),
    customsOverrides: {},
  }),
}));
// The shared inputs hook is the seam: it receives the preference each tab passes.
vi.mock('../usePiAdviceInputs', () => ({
  usePiAdviceInputs: (_s: unknown, _c: number, preference: RebuildPreference) => {
    seen.push(preference);
    const input = adviceInput('lean', { preference });
    return pricesDown
      ? { status: 'prices-failed', input }
      : { status: 'ready', prices: {}, hubName: 'Jita', input };
  },
}));

const { useMapAdvice } = await import('./useMapAdvice');
const { usePlanAdvice } = await import('../usePlanAdvice');

describe('useMapAdvice follows the Plan preference', () => {
  beforeEach(() => {
    seen.length = 0;
  });
  afterEach(async () => {
    await usePlanPreference.getState().setValue('isk');
  });

  it.each(['isk', 'haul'] as const)('Map picks equal Plan picks under %s', async (preference) => {
    await usePlanPreference.getState().setValue(preference);
    const map = renderHook(() => useMapAdvice(7, (id) => `P${id}`));
    await waitFor(() => expect(map.result.current.status).toBe('ready'));
    expect(seen).toContain(preference);
    const plan = renderHook(() =>
      usePlanAdvice({} as unknown as GoalPlannerSnapshot, 7, preference)
    );
    if (map.result.current.status !== 'ready' || plan.result.current.status !== 'ready') {
      throw new Error('both ready');
    }
    expect(planPicks(map.result.current.advice)).toEqual(planPicks(plan.result.current.advice));
    expect(map.result.current.advice).toEqual(buildPlanAdvice(adviceInput('lean', { preference })));
  });
});

describe('useMapAdvice when hub prices could not be read', () => {
  afterEach(() => {
    pricesDown = false;
  });

  it('still gives the board, flagged, instead of a failed state', async () => {
    pricesDown = true;
    const map = renderHook(() => useMapAdvice(7, (id) => `P${id}`));
    await waitFor(() => expect(map.result.current.status).toBe('ready'));
    if (map.result.current.status !== 'ready') throw new Error('ready');
    expect(map.result.current.pricesFailed).toBe(true);
  });
});
