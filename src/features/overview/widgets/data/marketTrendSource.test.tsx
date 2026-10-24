import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createFeedStore } from './feedStore';
import { FeedStoreContext } from './feedStoreContext';
import { MarketTrendSource } from './marketTrendSource';
import type { OverviewLayout } from '../layout';

const loadMarketTrend = vi.fn();
vi.mock('./marketTrendLoader', () => ({
  loadMarketTrend: (...args: unknown[]) => loadMarketTrend(...args),
}));

let layout: OverviewLayout | null = null;
vi.mock('../layoutStore', () => ({
  useOverviewLayout: Object.assign(
    (select: (s: { value: OverviewLayout | null }) => unknown) => select({ value: layout }),
    {}
  ),
}));
vi.mock('@/features/market/hub', () => ({
  useMarketHub: (select: (s: { value: string }) => unknown) => select({ value: 'amarr' }),
}));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (s: { activeCharacterId: number }) => unknown) =>
    select({ activeCharacterId: 91 }),
}));
vi.mock('@/lib/useHydratedStore', () => ({ useHydratedStore: () => true }));
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => ({ items: [{ typeId: 34, name: 'Tritanium', extra: 1 }] }),
}));

const widget = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'marketTrend',
  size: 'M' as const,
  view: 'chart' as const,
  scope: 'header' as const,
  showOnPhone: true,
  ...extra,
});

function mount() {
  const store = createFeedStore();
  render(
    <FeedStoreContext.Provider value={store}>
      <MarketTrendSource />
    </FeedStoreContext.Provider>
  );
  return store;
}

beforeEach(() => {
  loadMarketTrend.mockReset();
  loadMarketTrend.mockResolvedValue({ series: {}, quickbar: [] });
});

describe('MarketTrendSource', () => {
  it("asks for each widget's own items and hubs, falling back to the Quickbar and the Market hub", async () => {
    layout = {
      version: 1,
      widgets: [
        widget('a'),
        widget('b', { trendItems: [40520], trendHubs: ['jita', 'rens'] }),
        { ...widget('c'), kind: 'wallet' },
      ],
    };
    const store = mount();
    await waitFor(() => expect(store.get().marketTrend?.loading).toBe(false));
    expect(loadMarketTrend).toHaveBeenCalledTimes(1);
    expect(loadMarketTrend).toHaveBeenCalledWith({
      quickbar: [{ typeId: 34, name: 'Tritanium' }],
      defaultHubId: 'amarr',
      sets: [
        { typeIds: [34], hubIds: ['amarr'] },
        { typeIds: [40520], hubIds: ['jita', 'rens'] },
      ],
    });
  });

  it('reports the read as the marketTrend feed', async () => {
    layout = { version: 1, widgets: [widget('a')] };
    loadMarketTrend.mockResolvedValue({ series: { k: 1 }, quickbar: [] });
    const store = mount();
    await waitFor(() =>
      expect(store.get().marketTrend?.data).toEqual({ series: { k: 1 }, quickbar: [] })
    );
    expect(store.get().marketTrend?.error).toBe(false);
  });

  it('reports a failed read, with nothing to show behind it', async () => {
    layout = { version: 1, widgets: [widget('a')] };
    loadMarketTrend.mockRejectedValue(new Error('offline'));
    const store = mount();
    await waitFor(() => expect(store.get().marketTrend?.error).toBe(true));
    expect(store.get().marketTrend?.data).toBeNull();
  });
});
