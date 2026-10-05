import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import type { RegionOrder } from '@/esi/endpoints';
import { OrderRowDetail } from './OrderRowDetail';
import type { MarketOrderColumnId } from './marketOrderColumns';
import type { DataTableColumn } from '@/components/ui';

const JITA_44 = 60003760;
const NOW = Date.parse('2026-10-04T12:00:00Z');

const ORDER: RegionOrder = {
  order_id: 2,
  type_id: 2048,
  is_buy_order: false,
  price: 358_100,
  location_id: JITA_44,
  system_id: 30000142,
  volume_remain: 477,
  volume_total: 500,
  min_volume: 1,
  duration: 90,
  issued: '2026-10-01T12:00:00Z',
  range: 'region',
};

const NPC_STATIONS = new Map([
  [JITA_44, { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 }],
]);
const SYSTEMS = new Map([[30000142, { name: 'Jita', security: 0.95 }]]);
const NO_COLUMNS = {} as Record<MarketOrderColumnId, DataTableColumn<RegionOrder>>;

function renderDetail(overrides: Partial<Parameters<typeof OrderRowDetail>[0]> = {}) {
  return render(
    <OrderRowDetail
      order={ORDER}
      best={358_000}
      depth={{ units: 546, isk: 195_515_700 }}
      npcStations={NPC_STATIONS}
      solarSystems={SYSTEMS}
      hiddenColumns={[]}
      orderColumnsById={NO_COLUMNS}
      onFilterToStation={vi.fn()}
      now={NOW}
      {...overrides}
    />,
    { wrapper: MemoryRouter }
  );
}

describe('OrderRowDetail', () => {
  afterEach(() => configureClipboard(null));

  it('says how much of the order is left, how old it is, and how far above the best it sits', () => {
    renderDetail();
    expect(screen.getByText(/477 of 500 left/)).toBeInTheDocument();
    expect(screen.getByText(/23 units filled/)).toBeInTheDocument();
    expect(screen.getByText('issued 3d ago')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '477');
    expect(screen.getByText('+100.00 (+0.03%)')).toBeInTheDocument();
    expect(screen.getByText(/87 days left/)).toBeInTheDocument();
  });

  it('totals what taking the book down to this order costs, with the average price', () => {
    renderDetail();
    expect(screen.getByText('Buying down to here:')).toBeInTheDocument();
    expect(screen.getByText(/546 units for/)).toHaveTextContent('195.5M');
    expect(screen.getByText(/avg 358,087/)).toBeInTheDocument();
  });

  it('calls the best order the best price rather than a zero gap', () => {
    renderDetail({ order: { ...ORDER, price: 358_000 } });
    expect(screen.getByText('Best price')).toBeInTheDocument();
  });

  it('reads a buy order as selling down to it', () => {
    renderDetail({ order: { ...ORDER, is_buy_order: true }, best: 360_000 });
    expect(screen.getByText('Selling down to here:')).toBeInTheDocument();
  });

  it('narrows the book to this station, and offers it only while the book is not already narrowed', async () => {
    const user = userEvent.setup();
    const onFilterToStation = vi.fn();
    const { rerender } = renderDetail({ onFilterToStation });
    await user.click(screen.getByRole('button', { name: 'Only this station' }));
    expect(onFilterToStation).toHaveBeenCalledWith(JITA_44);

    rerender(
      <OrderRowDetail
        order={ORDER}
        best={358_000}
        depth={undefined}
        npcStations={NPC_STATIONS}
        solarSystems={SYSTEMS}
        hiddenColumns={[]}
        orderColumnsById={NO_COLUMNS}
        onFilterToStation={null}
        now={NOW}
      />
    );
    expect(screen.queryByRole('button', { name: 'Only this station' })).not.toBeInTheDocument();
  });

  it('copies the price as plain digits and says it did', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    configureClipboard(writeText);
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Copy price 358,100' }));
    expect(writeText).toHaveBeenCalledWith('358100');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('keeps Set destination disabled, with the reason, when no Character is signed in', () => {
    renderDetail();
    expect(
      screen.getByRole('button', {
        name: 'Set destination to Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      })
    ).toBeDisabled();
  });
});
