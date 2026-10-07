import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BoardCard, FoldedRow, NumberTile } from './BoardCard';
import { MiningTaxCard, OrdersCard, PlanetaryCard } from './cards';
import { miningTaxSummaryNode } from './miningSummaryNode';

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
    expect(screen.getAllByRole('button', { name: 'About Card' })).toHaveLength(1);
  });

  it('renders no help affordance without help text', () => {
    renderCard();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('MiningTaxCard scope', () => {
  it('reads out that it covers every Character (issue #2846)', () => {
    render(
      <MemoryRouter>
        <MiningTaxCard
          data={{
            unpaidIsk: 0,
            payeeCount: 0,
            unassignedCount: 0,
            oldestUnpaidDays: null,
            needsReauth: false,
            fetchedAt: null,
            characterCount: 3,
          }}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('All characters · 3')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /about open orders/i })).toBeTruthy();
  });
});

describe('FoldedRow mining summary', () => {
  it('renders the owed ISK as an IskAmount with the exact figure, keeping the plain aria-label', () => {
    const data = {
      unpaidIsk: 412_600_000,
      unassignedCount: 0,
      payeeCount: 2,
      needsReauth: false,
    } as unknown as Parameters<typeof miningTaxSummaryNode>[0];
    render(
      <MemoryRouter>
        <ul>
          <FoldedRow
            domain="Mining tax"
            summary="412.6M unpaid"
            summaryNode={miningTaxSummaryNode(data)}
            severity={null}
            to="/mining/tax"
          />
        </ul>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'Mining tax: 412.6M unpaid' });
    expect(link.textContent).toContain('412.6M');
    expect(link.textContent).toMatch(/412,600,000/);
    expect(link.textContent).toContain('unpaid');
  });

  it('has no node when nothing is owed', () => {
    expect(miningTaxSummaryNode(null)).toBeUndefined();
  });
});
