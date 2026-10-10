import { describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { ItemSearchStore } from '@/features/loyalty/itemSearch';
import type { LpStoreSearchState } from '@/features/loyalty/useLpStoreSearch';

const useLpStoreSearch = vi.fn<(query: string) => LpStoreSearchState>();
vi.mock('./useLpStoreSearch', () => ({
  useLpStoreSearch: (query: string) => useLpStoreSearch(query),
}));

const { LpStoreSearch } = await import('./LpStoreSearch');

function store(corporationId: number, name: string, offerId: number, jumps: number | null) {
  return {
    corporationId,
    corporationName: name,
    offer: {
      offer_id: offerId,
      type_id: 34,
      quantity: 1,
      isk_cost: 0,
      lp_cost: 100,
      required_items: [],
    },
    nearestSystemId: jumps === null ? null : 30000000 + corporationId,
    jumps,
  } satisfies ItemSearchStore;
}

const NEAR = store(1000120, 'Federation Navy', 11, 2);
const FAR = store(1000130, 'Sisters of EVE', 12, 9);

function row(offer: ItemSearchStore['offer'], profit: number, iskPerLp: number) {
  return {
    offer,
    profit: { profit, iskPerLp },
  } as unknown as LoyaltyOfferRow;
}

function state(overrides: Partial<LpStoreSearchState> = {}): LpStoreSearchState {
  return {
    status: 'ready',
    syncedAt: null,
    result: {
      groups: [{ typeId: 34, name: 'Tritanium Crystal', stores: [NEAR, FAR] }],
      corporations: [],
      totalItemMatches: 1,
    },
    heldStores: [],
    rowFor: (offer) =>
      offer.offer_id === NEAR.offer.offer_id
        ? row(offer, 125_000, 41.5)
        : row(offer, 80_000, 12.25),
    systemName: (id) => (id === null ? null : `System ${id % 1000}`),
    jumpsStatus: 'ready',
    pricing: false,
    ...overrides,
  };
}

const probe = { pathname: '', search: '', state: null as unknown };
function LocationProbe() {
  const { pathname, search, state: locationState } = useLocation();
  useEffect(() => {
    probe.pathname = pathname;
    probe.search = search;
    probe.state = locationState;
  }, [pathname, search, locationState]);
  return null;
}

function renderSearch(query = 'trit') {
  return render(
    <MemoryRouter initialEntries={['/market/lp-store']}>
      <LocationProbe />
      <Routes>
        <Route
          path="/market/lp-store"
          element={<LpStoreSearch query={query} onQueryChange={() => {}} />}
        />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LpStoreSearch', () => {
  it('shows a stacked panel per item with the store, profit and ISK/LP columns, nearest first', () => {
    useLpStoreSearch.mockReturnValue(state());
    renderSearch();

    const table = screen.getByRole('table', { name: 'Tritanium Crystal' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent?.replace(/\s+/g, ' ').trim())
    ).toEqual(['Store', 'Profit', 'ISK / LP']);

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Federation Navy');
    expect(rows[0]).toHaveTextContent('2 jumps');
    expect(rows[0]).toHaveTextContent('41.5');
    expect(rows[1]).toHaveTextContent('Sisters of EVE');
    expect(rows[1]).toHaveTextContent('12.3');
  });

  it('opens the store with the offer selected, carrying the query for the crumb back', () => {
    useLpStoreSearch.mockReturnValue(state());
    renderSearch('trit');

    fireEvent.click(screen.getByText('Sisters of EVE'));

    expect(probe.pathname).toBe('/market/lp-store/1000130');
    expect(probe.search).toBe('?offer=12');
    expect(probe.state).toEqual({ from: 'lp-search', q: 'trit' });
  });

  it('asks for a query before searching, and says when nothing matches', () => {
    useLpStoreSearch.mockReturnValue(
      state({ result: { groups: [], corporations: [], totalItemMatches: 0 } })
    );
    const { unmount } = renderSearch('');
    expect(screen.getByText('Search every LP Store')).toBeInTheDocument();
    unmount();

    renderSearch('zzz');
    expect(screen.getByText('Nothing matches')).toBeInTheDocument();
  });

  it('explains when the snapshot is unavailable and nothing else matches', () => {
    useLpStoreSearch.mockReturnValue(
      state({
        status: 'unavailable',
        result: { groups: [], corporations: [], totalItemMatches: 0 },
      })
    );
    renderSearch();
    expect(screen.getByText("Search isn't available")).toBeInTheDocument();
  });

  it('still lists matching stores while the snapshot is unavailable', () => {
    useLpStoreSearch.mockReturnValue(
      state({
        status: 'unavailable',
        result: {
          groups: [],
          corporations: [
            {
              corporationId: 1000120,
              corporationName: 'Federal Navy Academy',
              nearestSystemId: null,
              jumps: null,
            },
          ],
          totalItemMatches: 0,
        },
      })
    );
    renderSearch('fed');
    const link = screen.getByRole('link', { name: 'Federal Navy Academy' });
    expect(link).toHaveAttribute('href', '/market/lp-store/1000120');
    expect(screen.queryByText(/No stargate route/)).not.toBeInTheDocument();
  });

  it('lists the stores the Character holds LP with when the box is empty, with balances', () => {
    useLpStoreSearch.mockReturnValue(
      state({
        heldStores: [
          { corporationId: 1000120, name: 'Federal Navy Academy', lp: 12_000 },
          { corporationId: 1000130, name: 'Sisters of EVE', lp: 300 },
        ],
      })
    );
    renderSearch('');
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Federal Navy Academy12,000 LP',
      'Sisters of EVE300 LP',
    ]);
    fireEvent.click(links[0]!);
    expect(probe.pathname).toBe('/market/lp-store/1000120');
    expect(probe.state).toBeNull();
  });

  it('notes that stores are not ranked by jumps without a current system', () => {
    useLpStoreSearch.mockReturnValue(state({ jumpsStatus: 'no-origin' }));
    renderSearch();
    expect(screen.getByText(/Set your current system/)).toBeInTheDocument();
  });
});
