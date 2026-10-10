import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockAlertEntry } from '@/engine/stockTargets/stockAlert';
import { useMarketHub } from '@/features/market/hub';
import { loadStockBoard, stockBoardSeverity } from './stockBoard';
import { useSelectedStockList, useStockLists } from './stockListsStore';
import { loadStockAlertEntries } from './stockTargetsData';

vi.mock('./stockTargetsData', () => ({ loadStockAlertEntries: vi.fn() }));
vi.mock('@/market/prices', () => ({
  getHubPrices: vi.fn(async () => new Map([[1, { sellMin: 10 }]])),
}));

const entry = (over: Partial<StockAlertEntry>): StockAlertEntry => ({
  listId: 'a',
  listName: 'Efa',
  typeId: 1,
  name: 'Catalyst',
  target: 40,
  onHand: 0,
  ...over,
});

function seed(lists: { id: string; name: string }[]) {
  useStockLists.setState({
    value: lists.map((l) => ({ ...l, locationId: null, items: [{ typeId: 1, target: 40 }] })),
    hydrated: true,
    hydrate: async () => {},
  });
  useSelectedStockList.setState({ value: '', hydrated: true, hydrate: async () => {} });
  useMarketHub.setState({ value: 'jita', hydrated: true, hydrate: async () => {} });
}

beforeEach(() => vi.mocked(loadStockAlertEntries).mockReset());

describe('loadStockBoard', () => {
  it('is null with no Stock List, which keeps the card off the board', async () => {
    seed([]);
    expect(await loadStockBoard()).toBeNull();
  });

  it('summarises the first list, priced at the hub', async () => {
    seed([{ id: 'a', name: 'Efa' }]);
    vi.mocked(loadStockAlertEntries).mockResolvedValue([entry({ onHand: 0 })]);
    const board = await loadStockBoard();
    expect(board?.listName).toBe('Efa');
    expect(board?.summary).toMatchObject({ out: 1, low: 0, costToFill: 400 });
    expect(stockBoardSeverity(board)).toBe('warning');
  });

  it('says nothing about severity before any asset list is cached', async () => {
    seed([{ id: 'a', name: 'Efa' }]);
    vi.mocked(loadStockAlertEntries).mockResolvedValue([entry({ onHand: null })]);
    const board = await loadStockBoard();
    expect(board?.counted).toBe(false);
    expect(stockBoardSeverity(board)).toBeNull();
  });
});
