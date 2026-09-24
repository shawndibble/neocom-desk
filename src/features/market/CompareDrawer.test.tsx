import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadSkills } from '@/sde/loadSde';
import { useCompareSet } from './compareSet';
import { CompareDrawer } from './CompareDrawer';

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(),
}));
vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(),
  loadTypes: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

const mockedLoadDictionary = vi.mocked(loadAttributeDictionary);
const mockedLoadSkills = vi.mocked(loadSkills);

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
  }),
  http.get(`${ESI_BASE_URL}/universe/types/:typeId`, ({ params }) =>
    HttpResponse.json({
      type_id: Number(params.typeId),
      name: params.typeId === String(ITEM_A.typeId) ? ITEM_A.itemName : ITEM_B.itemName,
      description: '',
      group_id: 25,
      published: true,
      dogma_attributes: [{ attribute_id: 9, value: 1200 }],
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(async () => {
  server.resetHandlers();
  vi.clearAllMocks();
  await db.esiCache.clear();
});

beforeEach(() => {
  useCompareSet.setState({ items: [], view: 'prices', openRequest: 0 });
  mockedLoadDictionary.mockResolvedValue({
    9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
  });
  mockedLoadSkills.mockResolvedValue([]);
});

function renderDrawer() {
  return render(
    <CompareDrawer
      location={{
        mode: 'region',
        regionId: REGION_ID,
        hubStationId: 60003760,
        globalMarkets: new Map(),
      }}
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

  it('sizes the handle off the shared touch-tier scale, not a hand-written height (issue #1086)', () => {
    // jsdom has no layout, so this asserts the class token rather than a
    // rendered pixel height — e2e/marketCompareNarrow.spec.ts proves the
    // real 44px box at 390px against a live browser.
    act(() => useCompareSet.setState({ items: [ITEM_A] }));
    renderDrawer();
    const handle = screen.getByRole('button', { name: 'Compare (1)' });
    expect(handle.className).toContain('h-11');
    expect(handle.className).toContain('md:h-9');
  });

  it('opens the drawer and shows best sell, best buy, spread and volume for each item', async () => {
    const user = userEvent.setup();
    act(() => useCompareSet.setState({ items: [ITEM_A, ITEM_B] }));
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Compare (2)' }));

    const region = await screen.findByRole('region', { name: 'Compare' });
    // Prices render as shorthand (#947); the exact figure is the accessible name.
    await waitFor(() => expect(within(region).getByLabelText('100.00 ISK')).toBeInTheDocument());
    expect(within(region).getByLabelText('80.00 ISK')).toBeInTheDocument();
    expect(within(region).getByLabelText('20.00 ISK')).toBeInTheDocument(); // spread
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

  it('switches to the Attributes view and shows the dogma matrix, hiding the CSV export', async () => {
    const user = userEvent.setup();
    act(() => useCompareSet.setState({ items: [ITEM_A, ITEM_B] }));
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Compare (2)' }));
    const region = await screen.findByRole('region', { name: 'Compare' });

    await user.click(within(region).getByRole('button', { name: 'Attributes' }));

    expect(await within(region).findByText('Structure Hitpoints')).toBeInTheDocument();
    expect(within(region).getByText('Worth')).toBeInTheDocument();
    expect(within(region).getByText('Estimated Price')).toBeInTheDocument();
    expect(within(region).queryByLabelText('Export Compare Set to CSV')).not.toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Prices' }));
    expect(within(region).getByLabelText('Export Compare Set to CSV')).toBeInTheDocument();
    expect(within(region).queryByText('Structure Hitpoints')).not.toBeInTheDocument();
  });

  it('a pending open request from before mount (Variations "Compare") opens straight to the requested view', async () => {
    act(() => {
      useCompareSet.setState({ items: [ITEM_A] });
      useCompareSet.getState().openIn('attributes');
    });
    renderDrawer();

    const region = await screen.findByRole('region', { name: 'Compare' });
    expect(
      within(region).getByRole('button', { name: 'Attributes', pressed: true })
    ).toBeInTheDocument();
    expect(await within(region).findByText('Worth')).toBeInTheDocument();
  });

  it('a later openIn call while the drawer is closed opens it on the requested view', async () => {
    act(() => useCompareSet.setState({ items: [ITEM_A] }));
    renderDrawer();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    act(() => useCompareSet.getState().openIn('attributes'));

    const region = await screen.findByRole('region', { name: 'Compare' });
    expect(
      within(region).getByRole('button', { name: 'Attributes', pressed: true })
    ).toBeInTheDocument();
  });

  it('a later openIn call does not collapse an already-expanded drawer', async () => {
    const user = userEvent.setup();
    act(() => useCompareSet.setState({ items: [ITEM_A] }));
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Compare (1)' }));
    const region = await screen.findByRole('region', { name: 'Compare' });
    await user.click(within(region).getByRole('button', { name: 'Expand' }));
    expect(region.style.height).toBe('80vh');

    act(() => useCompareSet.getState().openIn('attributes'));

    expect(region.style.height).toBe('80vh');
  });
});
