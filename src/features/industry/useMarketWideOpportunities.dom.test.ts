import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import type { MarketWideFilters } from '@/engine/industry/marketWideFilters';
import type { TradeHub } from '@/market/hubs';
import type { MarketWideTreeMap } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { clearMarketWideScanCache } from './marketWideScanCache';
import { useMarketWideOpportunities } from './useMarketWideOpportunities';

const scan = vi.hoisted(() => vi.fn());
vi.mock('./marketWideOpportunities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./marketWideOpportunities')>()),
  runMarketWideScan: scan,
}));
vi.mock('./blueprintSourceSets', () => ({
  loadBlueprintSourceSets: () => Promise.resolve({ sets: {}, unavailable: [] }),
}));
vi.mock('./marketWideProductFacts', () => ({
  loadMarketWideProductFacts: () => Promise.reject(new Error('unread')),
}));

const hub = { id: 'jita' } as TradeHub;
const trees = {
  '1': { blueprintTypeID: 11, time: 1, outputQuantity: 1, marketGroupID: 1, materials: [] },
} as MarketWideTreeMap;
const catalog = {} as BlueprintCatalog;
const characterIds = [1];
const filters = {
  tiers: new Set(['t1']),
  categories: new Set(['ships']),
  sources: new Set(['owned']),
} as unknown as MarketWideFilters;
const rows = [{ productTypeID: 1, me: 10, te: 20 }] as unknown as MarketWideResultRow[];

function mount(assumedMe = 0) {
  return renderHook(
    (props: { assumedMe: number }) =>
      useMarketWideOpportunities({
        hub,
        trees,
        catalog,
        modifiers: NO_CHARACTER_MODIFIERS,
        characterIds,
        research: { owned: [], assumedMe: props.assumedMe, assumedTe: 0 },
        filters,
      }),
    { initialProps: { assumedMe } }
  );
}

describe('useMarketWideOpportunities cache', () => {
  beforeEach(() => {
    clearMarketWideScanCache();
    scan.mockReset();
    scan.mockResolvedValue(rows);
  });

  it('starts empty: a first visit never scans by itself', () => {
    const { result } = mount();
    expect(result.current.hasRun).toBe(false);
    expect(scan).not.toHaveBeenCalled();
  });

  it('shows the last scan on a remount at the same inputs without scanning again', async () => {
    const first = mount();
    act(() => first.result.current.run(filters));
    await waitFor(() => expect(first.result.current.hasRun).toBe(true));
    first.unmount();

    const second = mount();
    expect(second.result.current.hasRun).toBe(true);
    expect(second.result.current.rows).toEqual(rows);
    expect(second.result.current.fetchedAt).toBeInstanceOf(Date);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('does not show a scan priced at another assumed ME as current', async () => {
    const first = mount(0);
    act(() => first.result.current.run(filters));
    await waitFor(() => expect(first.result.current.hasRun).toBe(true));

    first.rerender({ assumedMe: 5 });
    expect(first.result.current.hasRun).toBe(false);
    expect(first.result.current.rows).toEqual([]);
    first.rerender({ assumedMe: 0 });
    expect(first.result.current.hasRun).toBe(true);
  });
});
