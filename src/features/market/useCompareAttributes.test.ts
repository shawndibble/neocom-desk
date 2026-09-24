import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { useCompareAttributes } from './useCompareAttributes';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadSkills } from '@/sde/loadSde';
import { db } from '@/db';
import { ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(),
}));
vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(),
  loadTypes: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

const mockedLoadDictionary = vi.mocked(loadAttributeDictionary);
const mockedLoadSkills = vi.mocked(loadSkills);

const ITEMS = [
  { typeId: 587, itemName: 'Rifter' },
  { typeId: 588, itemName: 'Republic Fleet Rifter' },
];

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(async () => {
  server.resetHandlers();
  vi.clearAllMocks();
  await db.esiCache.clear();
});

function rifterType(typeId: number, name: string, hp: number) {
  return http.get(`${ESI_BASE_URL}/universe/types/${typeId}`, () =>
    HttpResponse.json({
      type_id: typeId,
      name,
      description: '',
      group_id: 25,
      published: true,
      dogma_attributes: [{ attribute_id: 9, value: hp }],
    })
  );
}

describe('useCompareAttributes', () => {
  it('does not fetch while disabled', () => {
    server.use(rifterType(587, 'Rifter', 1200), rifterType(588, 'Republic Fleet Rifter', 1300));
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);
    const { result } = renderHook(() => useCompareAttributes(ITEMS, false));
    expect(result.current).toEqual({ data: null, loading: false, error: false });
  });

  it('fetches dogma attributes and the dictionary once enabled', async () => {
    server.use(rifterType(587, 'Rifter', 1200), rifterType(588, 'Republic Fleet Rifter', 1300));
    mockedLoadDictionary.mockResolvedValue({
      9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
    });
    mockedLoadSkills.mockResolvedValue([]);

    const { result } = renderHook(() => useCompareAttributes(ITEMS, true));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.data?.dogmaByTypeId.get(587)).toEqual([{ attribute_id: 9, value: 1200 }]);
    expect(result.current.data?.dictionary).toEqual({
      9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
    });
  });

  it('sets an error when a fetch fails, without throwing', async () => {
    server.use(
      rifterType(587, 'Rifter', 1200),
      http.get(`${ESI_BASE_URL}/universe/types/588`, () => HttpResponse.error())
    );
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);

    const { result } = renderHook(() => useCompareAttributes(ITEMS, true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('refetches only when the id set actually changes, not on an unrelated re-render', async () => {
    let calls = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/:typeId`, () => {
        calls += 1;
        return HttpResponse.json({
          type_id: 587,
          name: 'Rifter',
          description: '',
          group_id: 25,
          published: true,
          dogma_attributes: [{ attribute_id: 9, value: 1200 }],
        });
      })
    );
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ items }: { items: typeof ITEMS }) => useCompareAttributes(items, true),
      { initialProps: { items: ITEMS } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsAfterFirstFetch = calls;

    // Same ids, fresh array reference — must not refetch.
    rerender({ items: [...ITEMS] });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toBe(callsAfterFirstFetch);

    // A genuinely different id set must refetch.
    rerender({ items: [ITEMS[0]] });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toBeGreaterThan(callsAfterFirstFetch);
  });

  it('stops queuing type fetches once a run is cancelled mid-fan-out', async () => {
    // More items than the fan-out's concurrency, so some are still queued
    // behind the first wave when the drawer closes.
    const many = Array.from({ length: ESI_FANOUT_CONCURRENCY + 5 }, (_, index) => ({
      typeId: 1000 + index,
      itemName: `Item ${index}`,
    }));
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/:typeId`, async ({ params }) => {
        calls += 1;
        await gate;
        return HttpResponse.json({
          type_id: Number(params.typeId),
          name: 'Item',
          description: '',
          group_id: 25,
          published: true,
          dogma_attributes: [],
        });
      })
    );
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useCompareAttributes(many, enabled),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(calls).toBe(ESI_FANOUT_CONCURRENCY));

    rerender({ enabled: false });
    release();
    // Let the first wave settle and any queued workers get their turn.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toBe(ESI_FANOUT_CONCURRENCY);
  });
});
