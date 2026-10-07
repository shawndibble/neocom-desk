import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
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
const { hubBooks } = await import('./planAdviceModel');

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

  it('prices-failed still carries an input, on empty books, so what needs no price survives', async () => {
    pricesRead = async () => prices(true);
    const { result } = renderHook(() => usePiAdviceInputs(snapshot, 7, 'isk'));
    await waitFor(() => {
      if (result.current.status !== 'prices-failed' || !result.current.input)
        throw new Error('wait');
    });
    expect(hubBooks).toHaveBeenLastCalledWith({ prices: {}, buyPrices: {} }, 0);
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

  it("carries the character's saved richness picks, live, with no migration", async () => {
    pricesRead = async () => prices(false);
    await db.planetRichness.clear();
    await db.planetRichness.bulkPut([
      { id: '7:40000001', characterId: 7, planetId: 40000001, order: [2073], updatedAt: 1 },
      { id: '8:40000001', characterId: 8, planetId: 40000001, order: [2268], updatedAt: 1 },
    ]);
    const { result } = renderHook(() => usePiAdviceInputs(snapshot, 7, 'isk'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const richnessOf = () =>
      result.current.status === 'ready' ? result.current.input.prefs.richness : undefined;
    expect(richnessOf()?.get(40000001)).toEqual([2073]);

    await db.planetRichness.put({
      id: '7:40000002',
      characterId: 7,
      planetId: 40000002,
      order: [2305],
      updatedAt: 2,
    });
    await waitFor(() => expect(richnessOf()?.get(40000002)).toEqual([2305]));
    await db.planetRichness.clear();
  });
});
