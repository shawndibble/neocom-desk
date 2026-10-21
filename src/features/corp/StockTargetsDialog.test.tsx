import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { StockTargetsDialog } from './StockTargetsDialog';
import { useCorpStockTargetsStore } from './stockTargets';

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketTypes: async () => [
    { typeId: 34, name: 'Tritanium' },
    { typeId: 35, name: 'Pyerite' },
  ],
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async (ids: number[]) =>
    new Map(ids.map((id) => [id, id === 34 ? 'Tritanium' : id === 35 ? 'Pyerite' : `T${id}`])),
}));

const CORP = 98000001;

function seed(value: Record<string, Record<string, number>>) {
  useCorpStockTargetsStore.setState({ value, hydrated: true, hydrate: async () => {} });
}

function renderDialog(owned?: ReadonlyMap<number, number>) {
  return render(
    <StockTargetsDialog corporationId={CORP} open onOpenChange={() => {}} ownedByTypeId={owned} />
  );
}

const stored = () => useCorpStockTargetsStore.getState().value[String(CORP)];

beforeEach(() => seed({}));

describe('StockTargetsDialog', () => {
  it('says there are no targets yet', () => {
    renderDialog();
    expect(screen.getByText('No stock targets yet')).toBeInTheDocument();
  });

  it('lists targets by item name with owned counts when given', async () => {
    seed({ [CORP]: { '34': 1000 }, '5': { '35': 7 } });
    renderDialog(new Map([[34, 250]]));
    const list = screen.getByRole('list', { name: 'Stock targets' });
    expect(await within(list).findByText('Tritanium')).toBeInTheDocument();
    expect(within(list).getByText('250 owned')).toBeInTheDocument();
    expect(within(list).getByRole('spinbutton', { name: 'Target for Tritanium' })).toHaveValue(
      1000
    );
    expect(within(list).queryByText('Pyerite')).not.toBeInTheDocument();
  });

  it('adds a target for an item found by search', async () => {
    renderDialog();
    await userEvent.type(screen.getByRole('combobox', { name: 'Item' }), 'pyer');
    await userEvent.click(await screen.findByRole('option', { name: 'Pyerite' }));
    await userEvent.type(screen.getByLabelText('Target'), '300');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(stored()).toEqual({ '35': 300 }));
  });

  it('asks for an item and a quantity before adding', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Pick an item from the list.')).toBeInTheDocument();
    expect(stored()).toBeUndefined();
  });

  it('edits a target on blur and removes one', async () => {
    seed({ [CORP]: { '34': 1000 } });
    renderDialog();
    const field = await screen.findByRole('spinbutton', { name: 'Target for Tritanium' });
    await userEvent.clear(field);
    await userEvent.type(field, '1500');
    await userEvent.tab();
    await waitFor(() => expect(stored()).toEqual({ '34': 1500 }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove the stock target for Tritanium' })
    );
    await waitFor(() => expect(stored()).toEqual({}));
  });

  it('removes a target when its field is cleared', async () => {
    seed({ [CORP]: { '34': 1000 } });
    renderDialog();
    const field = await screen.findByRole('spinbutton', { name: 'Target for Tritanium' });
    await userEvent.clear(field);
    await userEvent.tab();
    await waitFor(() => expect(stored()).toEqual({}));
  });

  it('offers no edits until the stored targets have loaded', () => {
    seed({ [CORP]: { '34': 1000 } });
    useCorpStockTargetsStore.setState({ hydrated: false });
    renderDialog();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('offers no edits without a corporation', () => {
    render(<StockTargetsDialog corporationId={null} open onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
