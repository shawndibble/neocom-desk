import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockAlertEntry } from '@/engine/stockTargets/stockAlert';
import { useMarketHub } from '@/features/market/hub';
import { loadStockBoard, stockBoardSeverity } from './stockBoard';
import { useStockLists } from './stockListsStore';
import { loadStockAlertEntries } from './stockTargetsData';

vi.mock('./stockTargetsData', () => ({ loadStockAlertEntries: vi.fn() }));
vi.mock('@/market/prices', () => ({
  getHubPrices: vi.fn(async () => new Map([[1, { sellMin: 10 }]])),
}));

const entry = (over: Partial<StockAlertEntry>): StockAlertEntry => ({
  listId: 'a',
  listName: 'Efa',
  locationId: 7,
  typeId: 1,
  name: 'Catalyst',
  target: 40,
  listed: 0,
  inHangar: 0,
  ...over,
});

function seed(lists: { id: string; name: string }[]) {
  useStockLists.setState({
    value: lists.map((l) => ({ ...l, locationId: 7, items: [{ typeId: 1, target: 40 }] })),
    hydrated: true,
    hydrate: async () => {},
  });
  useMarketHub.setState({ value: 'jita', hydrated: true, hydrate: async () => {} });
}

beforeEach(() => vi.mocked(loadStockAlertEntries).mockReset());

describe('loadStockBoard', () => {
  it('is null with no market, which keeps the card off the board', async () => {
    seed([]);
    expect(await loadStockBoard()).toBeNull();
  });

  it('ranks every market worst first, priced at the hub', async () => {
    seed([
      { id: 'a', name: 'Efa' },
      { id: 'b', name: 'Amarr' },
      { id: 'c', name: 'Hek' },
    ]);
    vi.mocked(loadStockAlertEntries).mockResolvedValue([
      entry({ listId: 'a', listName: 'Efa', listed: 10, inHangar: 4 }),
      entry({ listId: 'b', listName: 'Amarr', listed: 0 }),
      entry({ listId: 'c', listName: 'Hek', listed: 40 }),
    ]);
    const board = await loadStockBoard();
    expect(board?.markets.map((m) => m.name)).toEqual(['Amarr', 'Efa', 'Hek']);
    expect(board?.markets[0].summary).toMatchObject({ out: 1, costToFill: 400 });
    expect(board?.markets[1].summary).toMatchObject({ low: 1, readyToList: 1, costToFill: 260 });
    expect(board?.totals).toEqual({ out: 1, low: 1 });
    expect(stockBoardSeverity(board)).toBe('warning');
  });

  it('is clear when every market is stocked', async () => {
    seed([{ id: 'a', name: 'Efa' }]);
    vi.mocked(loadStockAlertEntries).mockResolvedValue([entry({ listed: 40 })]);
    expect(stockBoardSeverity(await loadStockBoard())).toBe('clear');
  });

  it('says nothing about severity before any order list is cached', async () => {
    seed([{ id: 'a', name: 'Efa' }]);
    vi.mocked(loadStockAlertEntries).mockResolvedValue([entry({ listed: null })]);
    const board = await loadStockBoard();
    expect(board?.counted).toBe(false);
    expect(stockBoardSeverity(board)).toBeNull();
  });
});
