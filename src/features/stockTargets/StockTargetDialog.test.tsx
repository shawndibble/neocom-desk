import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { StockList } from '@/engine/stockTargets/stockLists';
import { useSelectedStockList, useStockLists } from './stockListsStore';
import { StockTargetDialog } from './StockTargetDialog';

const CATALYST = 16240;

function seed(lists: StockList[]) {
  useStockLists.setState({ value: lists, hydrated: true, hydrate: async () => {} });
  useSelectedStockList.setState({ value: '', hydrated: true, hydrate: async () => {} });
}

function renderDialog() {
  return render(
    <MemoryRouter>
      <StockTargetDialog typeId={CATALYST} itemName="Catalyst" onClose={() => {}} />
    </MemoryRouter>
  );
}

beforeEach(() => seed([]));

describe('StockTargetDialog', () => {
  it('points to Market › Stock when no market is set up yet', () => {
    renderDialog();
    expect(screen.getByText(/Set up a market first/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Stock' })).toHaveFocus();
  });

  it('sets the Stock Target on a market, starting with the quantity field', async () => {
    seed([{ id: 'a', name: 'Efa', locationId: 7, items: [] }]);
    renderDialog();
    const field = screen.getByLabelText('Keep listed');
    expect(field).toHaveFocus();
    await userEvent.type(field, '40');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(useStockLists.getState().value[0].items).toEqual([{ typeId: CATALYST, target: 40 }])
    );
  });

  it('says what is missing instead of saving an empty quantity', async () => {
    seed([{ id: 'a', name: 'Efa', locationId: 7, items: [] }]);
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter how many to keep listed.')).toBeInTheDocument();
    expect(useStockLists.getState().value[0].items).toEqual([]);
  });

  it('starts from the existing Stock Target and can take the item off the list', async () => {
    seed([{ id: 'a', name: 'Efa', locationId: 7, items: [{ typeId: CATALYST, target: 40 }] }]);
    renderDialog();
    expect(screen.getByLabelText('Keep listed')).toHaveValue(40);
    await userEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    await waitFor(() => expect(useStockLists.getState().value[0].items).toEqual([]));
  });
});
