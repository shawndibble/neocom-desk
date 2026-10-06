import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import type { PlanPrices } from './planPrices';

// A plain function, not a `vi.fn`: vitest's spy tracks a rejected result on a
// derived promise that reads as unhandled.
let pricesRead: () => Promise<PlanPrices> = async () => prices(false);
vi.mock('./goalPlannerSnapshot', () => ({ loadGoalPlannerPrices: () => pricesRead() }));
vi.mock('./colonyBudget', () => ({ loadCommandCenterUpgrades: vi.fn(async () => 5) }));
vi.mock('./planetSlots', () => ({ loadInterplanetaryConsolidation: vi.fn(async () => 4) }));
vi.mock('./planAdviceModel', () => ({ hubBooks: vi.fn(() => ({})) }));
const BASIS = vi.hoisted(() => ({ rules: {}, network: {}, key: 'k', hydrated: true }));
vi.mock('@/features/route/jumpBasis', () => ({ useJumpBasis: () => BASIS }));
vi.mock('@/features/contractSearch/routeExposure', () => ({
  routeExposure: vi.fn(async () => ({ kind: 'unknown' })),
}));

const { usePiAdviceInputs } = await import('./usePiAdviceInputs');

const snapshot = {
  pi: {},
  nowMs: 1,
  colonies: [{ solar_system_id: 30000142 }],
  customsOverrides: {},
  accountingLevel: 0,
  planetNames: new Map(),
} as unknown as GoalPlannerSnapshot;

function prices(failed: boolean): PlanPrices {
  return { prices: { 1: 1 }, buyPrices: {}, unpriced: [], failed, fetchedAt: new Date() };
}

describe('usePiAdviceInputs', () => {
  it('is ready with an input when prices load', async () => {
    pricesRead = async () => prices(false);
    const { result } = renderHook(() => usePiAdviceInputs(snapshot, 7, 'isk'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('reports prices-failed when the loader resolves {failed:true}', async () => {
    pricesRead = async () => prices(true);
    const { result } = renderHook(() => usePiAdviceInputs(snapshot, 7, 'isk'));
    await waitFor(() => expect(result.current.status).toBe('prices-failed'));
  });

  it('reports prices-failed when the loader throws a 503', async () => {
    pricesRead = () => Promise.reject(new Error('503 Service Unavailable'));
    const { result } = renderHook(() => usePiAdviceInputs(snapshot, 7, 'isk'));
    await waitFor(() => expect(result.current.status).toBe('prices-failed'));
  });

  it('stays loading until a snapshot arrives', () => {
    const { result } = renderHook(() => usePiAdviceInputs(null, 7, 'isk'));
    expect(result.current.status).toBe('loading');
  });
});
