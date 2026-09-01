import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { ESI_BASE_URL } from '@/esi/client';
import { useCompareSet } from './compareSet';
import { CompareDrawer } from './CompareDrawer';

const REGION_ID = 10000002;
const ITEM_A = { typeId: 34, itemName: 'Tritanium' };
const ITEM_B = { typeId: 35, itemName: 'Pyerite' };

const server = setupServer(
  http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/orders`, ({ request }) => {
    const typeId = new URL(request.url).searchParams.get('type_id');
    const orders =
      typeId === String(ITEM_A.typeId)
        ? [
            {
              order_id: 1,
              type_id: ITEM_A.typeId,
              is_buy_order: false,
              price: 100,
              location_id: 60003760,
              system_id: 30000142,
              volume_remain: 10,
              volume_total: 10,
              min_volume: 1,
              duration: 90,
              issued: '2026-08-01T00:00:00Z',
              range: 'region',
            },
            {
              order_id: 2,
              type_id: ITEM_A.typeId,
              is_buy_order: true,
              price: 80,
              location_id: 60003760,
              system_id: 30000142,
              volume_remain: 4,
              volume_total: 4,
              min_volume: 1,
              duration: 90,
              issued: '2026-08-01T00:00:00Z',
              range: 'region',
            },
          ]
        : [];
    return HttpResponse.json(orders, { headers: { 'X-Pages': '1' } });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(() => {
  useCompareSet.setState({ items: [] });
});

function renderDrawer() {
  return render(
    <CompareDrawer
      chosenRegionId={REGION_ID}
      globalMarkets={new Map()}
      locationMode="region"
      hubStationId={60003760}
      refreshTick={0}
    />
  );
}

describe('CompareDrawer', () => {
  it('shows the persistent handle with the current count and no drawer content until opened', () => {
    act(() => useCompareSet.setState({ items: [ITEM_A] }));
    renderDrawer();
    expect(screen.getByRole('button', { name: 'Compare (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('opens the drawer and shows best sell, best buy, spread and volume for each item', async () => {
    const user = userEvent.setup();
    act(() => useCompareSet.setState({ items: [ITEM_A, ITEM_B] }));
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Compare (2)' }));

    const region = await screen.findByRole('region', { name: 'Compare' });
    await waitFor(() => expect(within(region).getByText('100.00')).toBeInTheDocument());
    expect(within(region).getByText('80.00')).toBeInTheDocument();
    expect(within(region).getByText('20.00')).toBeInTheDocument(); // spread
    expect(within(region).getByText('10')).toBeInTheDocument(); // volume
    // Pyerite has no orders in the fixture, so its priced cells read the empty dash.
    const pyeriteRow = within(region).getByText('Pyerite').closest('tr');
    expect(pyeriteRow).not.toBeNull();
    expect(within(pyeriteRow as HTMLElement).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('removes an item from the row and from the underlying Compare Set', async () => {
    const user = userEvent.setup();
    act(() => useCompareSet.setState({ items: [ITEM_A] }));
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Compare (1)' }));
    await screen.findByRole('region', { name: 'Compare' });

    await user.click(screen.getByRole('button', { name: 'Remove Tritanium' }));

    expect(useCompareSet.getState().items).toEqual([]);
  });

  it('clears the whole set from the drawer header', async () => {
    const user = userEvent.setup();
    act(() => useCompareSet.setState({ items: [ITEM_A, ITEM_B] }));
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Compare (2)' }));
    await screen.findByRole('region', { name: 'Compare' });

    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(useCompareSet.getState().items).toEqual([]);
  });

  it('closes on Escape and returns focus to the handle', async () => {
    const user = userEvent.setup();
    act(() => useCompareSet.setState({ items: [ITEM_A] }));
    renderDrawer();
    const handle = screen.getByRole('button', { name: 'Compare (1)' });
    await user.click(handle);
    const region = await screen.findByRole('region', { name: 'Compare' });

    fireEvent.keyDown(region, { key: 'Escape' });

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(handle).toHaveFocus();
  });

  it('expands to a full view and back', async () => {
    const user = userEvent.setup();
    act(() => useCompareSet.setState({ items: [ITEM_A] }));
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Compare (1)' }));
    const region = await screen.findByRole('region', { name: 'Compare' });

    await user.click(screen.getByRole('button', { name: 'Expand' }));
    expect(region.style.height).toBe('80vh');

    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(region.style.height).not.toBe('80vh');
  });

  it('resizes on drag without disturbing the drawer’s open state', async () => {
    const user = userEvent.setup();
    act(() => useCompareSet.setState({ items: [ITEM_A] }));
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Compare (1)' }));
    const region = await screen.findByRole('region', { name: 'Compare' });
    const handleBar = screen.getByRole('separator', { name: 'Resize the drawer' });

    fireEvent.pointerDown(handleBar, { clientY: 400 });
    fireEvent.pointerMove(window, { clientY: 300 });
    fireEvent.pointerUp(window);

    expect(region).toHaveStyle({ height: '380px' });
  });
});
