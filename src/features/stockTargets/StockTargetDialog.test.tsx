import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { StockList } from '@/engine/stockTargets/stockLists';
import { useSelectedStockList, useStockLists } from './stockListsStore';
import { StockTargetDialog } from './StockTargetDialog';

const CATALYST = 16240;

function seed(lists: StockList[]) {
  useStockLists.setState({ value: lists, hydrated: true, hydrate: async () => {} });
  useSelectedStockList.setState({ value: '', hydrated: true, hydrate: async () => {} });
}

beforeEach(() => seed([]));

describe('StockTargetDialog', () => {
  it('names a first list and sets the Stock Target in one step', async () => {
    render(<StockTargetDialog typeId={CATALYST} itemName="Catalyst" onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Efa Market');
    await userEvent.type(screen.getByLabelText('Keep on hand'), '40');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useStockLists.getState().value).toHaveLength(1));
    const [list] = useStockLists.getState().value;
    expect(list.name).toBe('Efa Market');
    expect(list.items).toEqual([{ typeId: CATALYST, target: 40 }]);
  });

  it('starts from the existing Stock Target and can take the item off the list', async () => {
    seed([{ id: 'a', name: 'Efa', locationId: null, items: [{ typeId: CATALYST, target: 40 }] }]);
    render(<StockTargetDialog typeId={CATALYST} itemName="Catalyst" onClose={() => {}} />);
    expect(screen.getByLabelText('Keep on hand')).toHaveValue(40);
    await userEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    await waitFor(() => expect(useStockLists.getState().value[0].items).toEqual([]));
  });
});
