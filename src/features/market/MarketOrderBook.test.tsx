import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BookSideToggle, HubComparisonLine } from './MarketOrderBook';

const summary = (bestSell: number | null, bestBuy: number | null) => ({
  bestSell,
  bestBuy,
  spread: null,
  availableVolume: 0,
});

describe('HubComparisonLine', () => {
  it("puts the hub's best prices against the best in range, signed, with the distance", () => {
    render(
      <HubComparisonLine
        placeName="Amarr"
        summary={summary(358_000, 325_800)}
        inRangeBestSell={550_000}
        inRangeBestBuy={2_600}
        jumps={13}
        stationId={null}
        stationName={null}
        onView={vi.fn()}
      />
    );
    expect(screen.getByText('Amarr sells for 358,000')).toBeInTheDocument();
    expect(screen.getByText('−35%')).toBeInTheDocument();
    expect(screen.getByText('buys for 325,800')).toBeInTheDocument();
    expect(screen.getByText('125×')).toBeInTheDocument();
    expect(screen.getByText('13 jumps away')).toBeInTheDocument();
  });

  it('clears the range from its View button, so the book reads the hub again', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(
      <HubComparisonLine
        placeName="Amarr"
        summary={summary(358_000, null)}
        inRangeBestSell={550_000}
        inRangeBestBuy={null}
        jumps={null}
        stationId={null}
        stationName={null}
        onView={onView}
      />
    );
    await user.click(screen.getByRole('button', { name: 'View Amarr' }));
    expect(onView).toHaveBeenCalledOnce();
  });

  it('says nothing while the hub book loads, or when the hub has no orders either', () => {
    const { container, rerender } = render(
      <HubComparisonLine
        placeName="Amarr"
        summary={undefined}
        inRangeBestSell={550_000}
        inRangeBestBuy={null}
        jumps={13}
        stationId={null}
        stationName={null}
        onView={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <HubComparisonLine
        placeName="Amarr"
        summary={summary(null, null)}
        inRangeBestSell={550_000}
        inRangeBestBuy={null}
        jumps={13}
        stationId={null}
        stationName={null}
        onView={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BookSideToggle', () => {
  it('marks the side on show as pressed and switches on a press of the other', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BookSideToggle
        side="sell"
        onChange={onChange}
        sellCount={6}
        buyCount={1}
        bestSell={550_000}
        bestBuy={2_600}
      />
    );
    expect(screen.getByRole('button', { name: /Sell · 6/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(screen.getByRole('button', { name: /Buy · 1/ }));
    expect(onChange).toHaveBeenCalledWith('buy');
  });
});
