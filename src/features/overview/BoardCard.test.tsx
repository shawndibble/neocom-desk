import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BoardCard, NumberTile } from './BoardCard';
import { MiningTaxCard, OrdersCard, PlanetaryCard } from './cards';

function renderCard(help?: string) {
  return render(
    <MemoryRouter>
      <BoardCard title="Card" to="/market/orders" openLabel="Open" help={help}>
        <NumberTile label="One" value={1} severity="watch" />
        <NumberTile label="Two" value={2} severity="watch" />
      </BoardCard>
    </MemoryRouter>
  );
}

describe('BoardCard help', () => {
  it('renders exactly one help affordance however many tiles the card has', () => {
    renderCard('Plain-language explanation.');
    expect(screen.getAllByRole('button', { name: 'Plain-language explanation.' })).toHaveLength(1);
  });

  it('renders no help affordance without help text', () => {
    renderCard();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Overview jargon cards', () => {
  it('give Orders, Mining tax and Planetary one help button each', () => {
    const { container } = render(
      <MemoryRouter>
        <OrdersCard rows={[]} characterId={1} maxOrders={null} needsReauth={false} />
        <MiningTaxCard data={null} />
        <PlanetaryCard data={null} />
      </MemoryRouter>
    );
    expect(container.querySelectorAll('section')).toHaveLength(3);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /cost floor/i })).toBeTruthy();
  });
});
