import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

const loadMarketTypes = vi.fn();
vi.mock('@/sde/loadMarketSde', () => ({ loadMarketTypes: () => loadMarketTypes() }));

import { AddStockItemDialog } from './StockListDialogs';

beforeEach(() => loadMarketTypes.mockReset());

describe('AddStockItemDialog', () => {
  it('says item search needs a download when the catalogue is missing, and searches after Try again', async () => {
    loadMarketTypes
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([{ typeId: 34, name: 'Tritanium' }]);
    const user = userEvent.setup();
    render(<AddStockItemDialog listName="Ammo" onAdd={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText(/Item search needs a one-time download/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() =>
      expect(screen.queryByText(/Item search needs a one-time download/)).toBeNull()
    );
    await user.type(screen.getByRole('combobox'), 'Trit');
    expect(await screen.findByRole('option', { name: 'Tritanium' })).toBeInTheDocument();
  });
});
