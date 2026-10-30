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
        onView={vi.fn()}
      />
    );
    expect(screen.getByText('Amarr sells for 358,000')).toBeInTheDocument();
    expect(screen.getByText('−35%')).toBeInTheDocument();
    expect(screen.getByText('buys for 325,800')).toBeInTheDocument();
    expect(screen.getByText('125×')).toBeInTheDocument();
    expect(screen.getByText('13 jumps')).toBeInTheDocument();
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

  it('sorts the whole book before cutting to the row cap', async () => {
    const make = (id: number, price: number, volume_remain: number) => ({
      duration: 90,
      is_buy_order: false,
      issued: '2026-01-01T00:00:00Z',
      location_id: 60003760,
      min_volume: 1,
      order_id: id,
      price,
      range: 'region',
      system_id: 30000142,
      type_id: 34,
      volume_remain,
      volume_total: 10,
    });
    const orders = [make(1, 100, 900), make(2, 200, 500), make(3, 300, 100)];
    type Order = (typeof orders)[number];
    const columns = [
      {
        id: 'price',
        header: 'Price',
        render: (o: Order) => `price ${o.price}`,
        sortValue: (o: Order) => o.price,
      },
      {
        id: 'quantity',
        header: 'Qty',
        render: (o: Order) => `qty ${o.volume_remain}`,
        sortValue: (o: Order) => o.volume_remain,
      },
    ];
    function Harness() {
      const tableExport = useTableExport({
        surface: 'market-appraisal',
        rows: orders,
        columns: [],
      });
      return (
        <OrderSideCard
          side="sell"
          rows={orders}
          rowCap={1}
          total={3}
          best={100}
          columns={columns}
          availableColumns={[]}
          visibleColumns={[]}
          columnsById={{} as never}
          onToggleColumn={vi.fn()}
          tableExport={tableExport}
          empty={null}
          onShowAll={vi.fn()}
          renderDetail={() => <div>detail</div>}
          rowContextMenu={(_o, tr) => tr}
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
    expect(await screen.findByText('price 100')).toBeInTheDocument();
    // First click is high to low (the first row anyway); the second, low to high, pulls
    // the smallest from beyond the cap, which only a whole-book sort can do.
    await userEvent.click(screen.getByRole('button', { name: /Qty/ }));
    expect(screen.getByText('qty 900')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Qty/ }));
    expect(screen.getByText('qty 100')).toBeInTheDocument();
    expect(screen.queryByText('qty 900')).not.toBeInTheDocument();
  });

  describe('heading figures', () => {
    const make = (id: number, price: number, volume_remain: number) => ({
      duration: 90,
      is_buy_order: false,
      issued: '2026-01-01T00:00:00Z',
      location_id: 60003760,
      min_volume: 1,
      order_id: id,
      price,
      range: 'region',
      system_id: 30000142,
      type_id: 34,
      volume_remain,
      volume_total: 10,
    });
    function Harness({ orders }: { orders: ReturnType<typeof make>[] }) {
      const tableExport = useTableExport({
        surface: 'market-appraisal',
        rows: orders,
        columns: [],
      });
      return (
        <OrderSideCard
          side="sell"
          rows={orders}
          total={orders.length}
          best={1000}
          columns={[]}
          availableColumns={[]}
          visibleColumns={[]}
          columnsById={{} as never}
          onToggleColumn={vi.fn()}
          tableExport={tableExport}
          empty={null}
          onShowAll={null}
          renderDetail={() => <div>detail</div>}
          rowContextMenu={(_o, tr) => tr}
          rowClassName={() => undefined}
          hiddenOnPhone={false}
          cards={false}
        />
      );
    }
    const renderHarness = (orders: ReturnType<typeof make>[]) =>
      render(
        withItemActions(
          <MemoryRouter>
            <Harness orders={orders} />
          </MemoryRouter>,
          fakeItemActions()
        )
      );

    it('shows units by default, the ISK value only once ticked in Columns', async () => {
      renderHarness([make(1, 1000, 1_000), make(2, 2000, 1_500)]);
      expect(await screen.findByText('2,500 units')).toBeInTheDocument();
      expect(screen.queryByText(/ISK/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'ISK value listed' }));
      expect(await screen.findByText('≈ 4M ISK')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Units listed' }));
      expect(screen.queryByText('2,500 units')).not.toBeInTheDocument();
      // The pick is a stored preference; put it back for the next test.
      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Units listed' }));
    });

    it('follows the rows on screen', async () => {
      const { rerender } = renderHarness([make(1, 1000, 1_000), make(2, 2000, 1_500)]);
      expect(await screen.findByText('2,500 units')).toBeInTheDocument();
      rerender(
        withItemActions(
          <MemoryRouter>
            <Harness orders={[make(1, 1000, 1_000)]} />
          </MemoryRouter>,
          fakeItemActions()
        )
      );
      expect(await screen.findByText('1,000 units')).toBeInTheDocument();
    });

    it('says "1 unit" for a single unit', async () => {
      renderHarness([make(1, 1000, 1)]);
      expect(await screen.findByText('1 unit')).toBeInTheDocument();
    });
  });
});
