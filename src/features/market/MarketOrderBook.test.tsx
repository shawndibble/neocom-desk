import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MemoryRouter } from 'react-router-dom';
import { useTableExport } from '@/components/ui/useTableExport';
import { fakeItemActions, withItemActions } from './__fixtures__/itemActions';
import { ItemContextMenu } from './ItemContextMenu';
import { BookSideToggle, HubComparisonLine, OrderSideCard } from './MarketOrderBook';

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

describe('OrderSideCard', () => {
  it('shows a visible More actions button on each order row', async () => {
    const order = {
      duration: 90,
      is_buy_order: false,
      issued: '2026-01-01T00:00:00Z',
      location_id: 60003760,
      min_volume: 1,
      order_id: 1,
      price: 100,
      range: 'region',
      system_id: 30000142,
      type_id: 34,
      volume_remain: 5,
      volume_total: 10,
    };
    const columns = [
      {
        id: 'price',
        header: 'Price',
        render: (o: typeof order) => String(o.price),
        sortValue: (o: typeof order) => o.price,
      },
    ];
    function Harness() {
      const tableExport = useTableExport({
        surface: 'market-appraisal',
        rows: [order],
        columns: [],
      });
      return (
        <OrderSideCard
          side="sell"
          rows={[order]}
          total={1}
          best={100}
          columns={columns}
          availableColumns={[]}
          visibleColumns={[]}
          columnsById={{} as never}
          onToggleColumn={vi.fn()}
          tableExport={tableExport}
          empty={null}
          onShowAll={null}
          renderDetail={() => <div>detail</div>}
          rowContextMenu={(o, tr) => (
            <ItemContextMenu typeId={o.type_id} itemName="Tritanium">
              {tr}
            </ItemContextMenu>
          )}
          rowClassName={() => undefined}
          hiddenOnPhone={false}
          cards={false}
        />
      );
    }
    render(
      withItemActions(
        <MemoryRouter>
          <Harness />
        </MemoryRouter>,
        fakeItemActions()
      )
    );
    expect(
      await screen.findByRole('button', { name: 'More actions for Tritanium' })
    ).toBeInTheDocument();
  });
});
