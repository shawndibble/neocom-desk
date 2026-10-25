import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { buildStockRows } from '@/engine/stockTargets/stockRows';
import type { StockList } from '@/engine/stockTargets/stockLists';
import { encodeStockListShare } from '@/engine/stockTargets/stockListShare';
import { ItemActionsContext, type ItemActions } from '@/features/market/itemActions';
import { useSelectedStockList, useStockLists } from './stockListsStore';
import { StockTab } from './StockTab';

const CATALYST = 16240;
const PASTE = 28668;
const WARRIOR = 2488;
const EFA = 1035466617946;
const AMARR = 60008494;

vi.mock('./stockTargetsData', () => ({
  loadStockTargetsData: vi.fn(async (list: StockList) => {
    const listed: Record<number, number> = { [CATALYST]: 0, [PASTE]: 310, [WARRIOR]: 188 };
    const inHangar: Record<number, number> = { [CATALYST]: 12 };
    const price: Record<number, number> = { [CATALYST]: 1_050_000, [PASTE]: 2100, [WARRIOR]: 4200 };
    return {
      rows: buildStockRows(
        list.items.map((item) => ({
          typeId: item.typeId,
          target: item.target,
          listed: listed[item.typeId] ?? 0,
          inHangar: inHangar[item.typeId] ?? 0,
          price: price[item.typeId] ?? null,
        }))
      ),
      names: new Map([
        [CATALYST, 'Catalyst'],
        [PASTE, 'Nanite Repair Paste'],
        [WARRIOR, 'Warrior II'],
      ]),
      incompleteCharacters: [],
      oldestFetchedAt: null,
      groups: new Map(),
      place: { name: 'Efa VI - Corp Market', kind: 'structure', systemName: 'Efa', security: 0.4 },
    };
  }),
  loadStockMarkets: vi.fn(async (lists: StockList[]) => ({
    markets: lists
      .map((list) => ({
        listId: list.id,
        name: list.name,
        items: list.items.length,
        out: list.id === 'amarr' ? 2 : 0,
        low: 0,
        readyToList: 0,
        costToFill: 0,
        unpricedShort: 0,
        place: null,
      }))
      .sort((a, b) => b.out - a.out),
    incompleteCharacters: [],
    oldestFetchedAt: null,
  })),
  loadSellLocations: vi.fn(async () => []),
  loadListedAtMarket: vi.fn(async () => []),
}));

const showInfo = vi.fn();
const actions: ItemActions = {
  canAddToQuickbar: true,
  addToQuickbar: () => {},
  showInfo,
  blueprints: null,
  blueprintFor: () => null,
  requestBlueprints: () => {},
};

const efa: StockList = {
  id: 'efa',
  name: 'Efa Market',
  locationId: EFA,
  items: [
    { typeId: WARRIOR, target: 200 },
    { typeId: PASTE, target: 1500 },
    { typeId: CATALYST, target: 40 },
  ],
};
const amarr: StockList = {
  id: 'amarr',
  name: 'Amarr Shop',
  locationId: AMARR,
  items: [{ typeId: CATALYST, target: 5 }],
};

function renderTab(path = '/market/stock') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ItemActionsContext.Provider value={actions}>
        <Routes>
          <Route path="/market/*" element={<StockTab activeCharacterId={1} />} />
        </Routes>
      </ItemActionsContext.Provider>
    </MemoryRouter>
  );
}

function seed(lists: StockList[]) {
  useStockLists.setState({ value: lists, hydrated: true, hydrate: async () => {} });
  useSelectedStockList.setState({ value: '', hydrated: true, hydrate: async () => {} });
}

beforeEach(() => {
  showInfo.mockReset();
});

describe('StockTab', () => {
  it('invites a first market when there is none', async () => {
    seed([]);
    renderTab();
    expect(await screen.findByText('No markets yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New market…' })).toBeInTheDocument();
  });

  it('opens the only market directly, worst first, with how to restock each item', async () => {
    seed([efa]);
    renderTab();
    const table = await screen.findByRole('table', { name: 'Stock targets' });
    expect(screen.getByRole('heading', { name: 'Efa Market' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /All markets/ })).not.toBeInTheDocument();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[1].textContent)).toEqual([
      'Catalyst',
      'Nanite Repair Paste',
      'Warrior II',
    ]);
    expect(within(rows[0]).getByText('Out')).toBeInTheDocument();
    expect(within(rows[0]).getByText('List 12 from hangar')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Buy or build 28')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Low')).toBeInTheDocument();
    expect(within(rows[2]).getByText('OK')).toBeInTheDocument();
  });

  it('narrows the table to one status, or to what the hangar can restock', async () => {
    seed([efa]);
    renderTab();
    const table = await screen.findByRole('table', { name: 'Stock targets' });
    const chips = screen.getByRole('group', { name: 'Status' });
    await userEvent.click(within(chips).getByRole('button', { name: /Low/ }));
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(within(table).getByText('Nanite Repair Paste')).toBeInTheDocument();
    await userEvent.click(within(chips).getByRole('button', { name: /Ready to list/ }));
    await waitFor(() => expect(within(table).getByText('Catalyst')).toBeInTheDocument());
    expect(within(table).getAllByRole('row')).toHaveLength(2);
  });

  it('edits a Stock Target in place', async () => {
    seed([efa]);
    renderTab();
    await screen.findByRole('table', { name: 'Stock targets' });
    await userEvent.click(screen.getByRole('button', { name: /Edit stock target for Catalyst/ }));
    const field = screen.getByRole('textbox', { name: 'Stock target for Catalyst' });
    await userEvent.clear(field);
    await userEvent.type(field, '55{Enter}');
    await waitFor(() =>
      expect(
        useStockLists.getState().value[0].items.find((item) => item.typeId === CATALYST)?.target
      ).toBe(55)
    );
  });

  it('starts the edit with a digit typed on the target, and keeps typing after it', async () => {
    seed([efa]);
    renderTab();
    await screen.findByRole('table', { name: 'Stock targets' });
    screen.getByRole('button', { name: /Edit stock target for Catalyst/ }).focus();
    await userEvent.keyboard('75{Enter}');
    await waitFor(() =>
      expect(
        useStockLists.getState().value[0].items.find((item) => item.typeId === CATALYST)?.target
      ).toBe(75)
    );
  });

  it('removes ticked rows at once and Undo restores them with their targets', async () => {
    seed([efa]);
    renderTab();
    const table = await screen.findByRole('table', { name: 'Stock targets' });
    expect(screen.queryByRole('button', { name: /Remove selected/ })).not.toBeInTheDocument();
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Catalyst' }));
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Warrior II' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove selected (2)' }));
    await waitFor(() =>
      expect(useStockLists.getState().value[0].items).toEqual([{ typeId: PASTE, target: 1500 }])
    );
    expect((await screen.findAllByText('Removed 2 items')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(useStockLists.getState().value[0].items).toHaveLength(3));
    const items = useStockLists.getState().value[0].items;
    expect(items.find((i) => i.typeId === CATALYST)?.target).toBe(40);
    expect(items.find((i) => i.typeId === WARRIOR)?.target).toBe(200);
  });

  it('selects all only among the visible rows, and a filter change drops the ticks', async () => {
    seed([efa]);
    renderTab();
    const table = await screen.findByRole('table', { name: 'Stock targets' });
    const chips = screen.getByRole('group', { name: 'Status' });
    await userEvent.click(within(chips).getByRole('button', { name: /Low/ }));
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Remove selected (1)' })).toBeInTheDocument();
    await userEvent.click(within(chips).getByRole('button', { name: /^All/ }));
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(4));
    expect(screen.queryByRole('button', { name: /Remove selected/ })).not.toBeInTheDocument();
  });

  it('opens Show Info from a row', async () => {
    seed([efa]);
    renderTab();
    const table = await screen.findByRole('table', { name: 'Stock targets' });
    await userEvent.click(within(table).getByText('Warrior II'));
    expect(showInfo).toHaveBeenCalledWith(WARRIOR, 'Warrior II');
  });

  it('lists several markets worst first, and opens one with a way back', async () => {
    seed([efa, amarr]);
    renderTab();
    const table = await screen.findByRole('table', { name: 'Markets' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Amarr Shop')).toBeInTheDocument();
    expect(within(rows[0]).getByText('2 out')).toBeInTheDocument();
    await userEvent.click(within(rows[1]).getByRole('link', { name: 'Efa Market' }));
    expect(await screen.findByRole('heading', { name: 'Efa Market' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All markets/ })).toBeInTheDocument();
  });

  it("opens the market an alert names by its station's id", async () => {
    seed([efa, amarr]);
    renderTab(`/market/stock?market=${EFA}`);
    expect(await screen.findByRole('heading', { name: 'Efa Market' })).toBeInTheDocument();
  });

  it('saves a copy of a shared market from its link', async () => {
    seed([]);
    const code = encodeStockListShare({
      name: 'Efa Market',
      locationId: EFA,
      items: [{ typeId: CATALYST, target: 40 }],
    });
    renderTab(`/market/stock?list=${code}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Save a copy' }));
    await waitFor(() => expect(useStockLists.getState().value).toHaveLength(1));
    expect(useStockLists.getState().value[0]).toMatchObject({
      name: 'Efa Market',
      locationId: EFA,
      items: [{ typeId: CATALYST, target: 40 }],
    });
    expect(screen.queryByRole('region', { name: 'Shared market' })).not.toBeInTheDocument();
  });
});
