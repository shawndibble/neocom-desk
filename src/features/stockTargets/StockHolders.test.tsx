import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { StockHolders } from './StockHolders';

const nameOf = (id: number) => (id === 1 ? 'Kestrel Vane' : 'Orsa Tellemar');

describe('StockHolders', () => {
  it('names a single holder inline beside the total', () => {
    render(
      <StockHolders
        total={40}
        holders={[{ characterId: 1, quantity: 40 }]}
        heading="Listed by"
        nameOf={nameOf}
      />
    );
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('Kestrel Vane')).toBeInTheDocument();
  });

  it('collapses several holders to a count that opens the split', async () => {
    render(
      <StockHolders
        total={20}
        holders={[
          { characterId: 1, quantity: 12 },
          { characterId: 2, quantity: 8 },
        ]}
        heading="Listed by"
        nameOf={nameOf}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /2 characters/ }));
    expect(await screen.findByText('Listed by')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Orsa Tellemar')).toBeInTheDocument();
  });

  it('shows the bare total when nobody is attributed', () => {
    render(<StockHolders total={0} holders={[]} heading="x" nameOf={nameOf} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
