import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildStockRows } from '@/engine/stockTargets/stockRows';
import type { StockList } from '@/engine/stockTargets/stockLists';
import { encodeStockListShare } from '@/engine/stockTargets/stockListShare';
import { ItemActionsContext, type ItemActions } from '@/features/market/itemActions';
import { useSelectedStockList, useStockLists } from './stockListsStore';
import { StockTargetsTab } from './StockTargetsTab';

const CATALYST = 16240;
const PASTE = 28668;
const WARRIOR = 2488;

vi.mock('./stockTargetsData', () => ({
  loadStockTargetsData: vi.fn(async (list: StockList) => {
    const onHand: Record<number, number> = { [CATALYST]: 0, [PASTE]: 310, [WARRIOR]: 188 };
    const price: Record<number, number> = { [CATALYST]: 1_050_000, [PASTE]: 2100, [WARRIOR]: 4200 };
    return {
      rows: buildStockRows(
        list.items.map((item) => ({
          typeId: item.typeId,
          target: item.target,
          onHand: onHand[item.typeId] ?? 0,
          price: price[item.typeId] ?? null,
        }))
      ),
      names: new Map([
        [CATALYST, 'Catalyst'],
        [PASTE, 'Nanite Repair Paste'],
        [WARRIOR, 'Warrior II'],
      ]),
      counts: new Map(),
      incompleteCharacters: [],
      oldestFetchedAt: null,
      locations: [],
    };
  }),
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
  locationId: null,
  items: [
    { typeId: WARRIOR, target: 200 },
    { typeId: PASTE, target: 1500 },
    { typeId: CATALYST, target: 40 },
  ],
};

function renderTab(path = '/assets/targets') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ItemActionsContext.Provider value={actions}>
        <StockTargetsTab activeCharacterId={1} />
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

describe('StockTargetsTab', () => {
  it('invites a first list when there is none', async () => {
    seed([]);
    renderTab();
    expect(await screen.findByText('No stock lists yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New list…' })).toBeInTheDocument();
  });

  it('lists the Stock Targets worst first with a status word on each', async () => {
    seed([efa]);
    renderTab();
    const table = await screen.findByRole('table', { name: 'Stock targets' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      'Catalyst',
      'Nanite Repair Paste',
      'Warrior II',
    ]);
    expect(within(rows[0]).getByText('Out')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Low')).toBeInTheDocument();
    expect(within(rows[2]).getByText('OK')).toBeInTheDocument();
    // One out, one low: both summary chips read "1 item".
    expect(screen.getAllByText('1 item', { selector: 'span' })).toHaveLength(2);
  });

  it('narrows the table to one status from its chip', async () => {
    seed([efa]);
    renderTab();
    const table = await screen.findByRole('table', { name: 'Stock targets' });
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: /Low/ })
    );
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(within(table).getByText('Nanite Repair Paste')).toBeInTheDocument();
  });

  it('edits a Stock Target in place', async () => {
    seed([efa]);
    renderTab();
    await screen.findByRole('table', { name: 'Stock targets' });
    await userEvent.click(screen.getByRole('button', { name: /Edit stock target for Catalyst/ }));
    const field = screen.getByRole('spinbutton', { name: 'Stock target for Catalyst' });
    await userEvent.clear(field);
    await userEvent.type(field, '55{Enter}');
    await waitFor(() =>
      expect(
        useStockLists.getState().value[0].items.find((item) => item.typeId === CATALYST)?.target
      ).toBe(55)
    );
  });

  it('opens Show Info from a row', async () => {
    seed([efa]);
    renderTab();
    const table = await screen.findByRole('table', { name: 'Stock targets' });
    await userEvent.click(within(table).getByText('Warrior II'));
    expect(showInfo).toHaveBeenCalledWith(WARRIOR, 'Warrior II');
  });

  it('saves a copy of a shared list from its link', async () => {
    seed([]);
    const code = encodeStockListShare({
      name: 'Efa Market',
      items: [{ typeId: CATALYST, target: 40 }],
    });
    renderTab(`/assets/targets?list=${code}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Save a copy' }));
    await waitFor(() => expect(useStockLists.getState().value).toHaveLength(1));
    expect(useStockLists.getState().value[0]).toMatchObject({
      name: 'Efa Market',
      items: [{ typeId: CATALYST, target: 40 }],
    });
    expect(screen.queryByRole('region', { name: 'Shared stock list' })).not.toBeInTheDocument();
  });
});
