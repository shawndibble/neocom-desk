import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { LpLandingOffer, LpLandingStoreFacts } from '@/features/loyalty/lpLanding';
import type { LpStoreLandingState } from '@/features/loyalty/useLpStoreLanding';

const landing = vi.fn<() => LpStoreLandingState>();
vi.mock('@/features/loyalty/useLpStoreLanding', () => ({ useLpStoreLanding: () => landing() }));

const { LoyaltyStoreLanding } = await import('./LoyaltyStoreLanding');

function store(over: Partial<LpLandingStoreFacts> & { corporationId: number; name: string }) {
  return {
    factionId: null,
    factionWarfare: false,
    nearest: { systemId: 30000142, jumps: 2 },
    yourLp: null,
    lpValue: 1000,
    offerCount: 1,
    ...over,
  } satisfies LpLandingStoreFacts;
}

function offer(
  facts: LpLandingStoreFacts,
  id: number,
  itemName: string,
  iskPerLp: number,
  sellsPerDay: number
): LpLandingOffer {
  const row = {
    offer: {
      offer_id: id,
      type_id: id,
      quantity: 1,
      isk_cost: 0,
      lp_cost: 100,
      required_items: [],
    },
    itemName,
    isBlueprint: false,
    requiredItems: [],
    sellsPerDay,
    profit: { iskPerLp, profit: iskPerLp * 100 },
  } as unknown as LoyaltyOfferRow;
  return { row, store: facts, categoryId: null };
}

const SISTERS = store({ corporationId: 1, name: 'Sisters of EVE', lpValue: 1600, yourLp: 300_000 });
const NAVY = store({ corporationId: 2, name: 'Caldari Navy', lpValue: 1200 });
const OFFERS = [
  offer(SISTERS, 11, 'Sisters Core Probe Launcher', 2100, 38),
  offer(NAVY, 21, 'Navy Cap Booster 800', 1100, 410),
  offer(NAVY, 22, 'Caldari Navy Officer Cap', 4000, 0),
];

function state(over: Partial<LpStoreLandingState> = {}): LpStoreLandingState {
  return {
    status: 'ready',
    syncedAt: null,
    stores: [NAVY, SISTERS],
    offers: OFFERS,
    pricing: false,
    valuing: false,
    balancesKnown: true,
    systemName: () => 'Jita',
    factionName: () => null,
    jumpsStatus: 'ready',
    factions: [],
    categories: [],
    ...over,
  };
}

const probe: { pathname: string; search: string; state: unknown } = {
  pathname: '',
  search: '',
  state: null,
};
function LocationProbe() {
  const location = useLocation();
  useEffect(() => {
    probe.pathname = location.pathname;
    probe.search = location.search;
    probe.state = location.state;
  }, [location]);
  return null;
}

function renderLanding(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/wallet/lp-store${search}`]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <LoyaltyStoreLanding />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

const rowNames = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]!.textContent);

beforeEach(() => {
  landing.mockReturnValue(state());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LoyaltyStoreLanding', () => {
  it('opens on every store ranked by LP Value, with the LP the Character holds', () => {
    renderLanding();
    const table = screen.getByRole('table', { name: 'LP Stores' });
    expect(rowNames(table)).toEqual([
      expect.stringContaining('Sisters of EVE'),
      expect.stringContaining('Caldari Navy'),
    ]);
    expect(screen.getByText('300,000 in 1 store')).toBeInTheDocument();
  });

  it('counts the default sales floor on the funnel', () => {
    renderLanding();
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeInTheDocument();
  });

  it('lists every offer by ISK/LP in the Offers view, without the one nobody buys', async () => {
    const user = userEvent.setup();
    renderLanding();
    await user.click(
      within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Offers' })
    );
    await waitFor(() => expect(probe.search).toBe('?view=offers'));
    expect(rowNames(screen.getByRole('table', { name: 'LP Store offers' }))).toEqual([
      expect.stringContaining('Sisters Core Probe Launcher'),
      expect.stringContaining('Navy Cap Booster 800'),
    ]);
  });

  it('shows the floored offer again at Any volume', () => {
    renderLanding('?view=offers&minSells=0');
    expect(rowNames(screen.getByRole('table', { name: 'LP Store offers' }))[0]).toContain(
      'Caldari Navy Officer Cap'
    );
  });

  it('narrows the offers by the search box, by item or store name', async () => {
    const user = userEvent.setup();
    renderLanding('?view=offers');
    await user.type(screen.getByRole('searchbox', { name: 'Search LP Stores' }), 'sisters');
    await waitFor(() =>
      expect(rowNames(screen.getByRole('table', { name: 'LP Store offers' }))).toEqual([
        expect.stringContaining('Sisters Core Probe Launcher'),
      ])
    );
  });

  it('opens the store on the offer, carrying the landing view for Close', async () => {
    const user = userEvent.setup();
    renderLanding('?view=offers');
    await user.click(screen.getByText('Navy Cap Booster 800'));
    expect(probe.pathname).toBe('/wallet/lp-store/2');
    expect(probe.search).toBe('?offer=21');
    expect(probe.state).toEqual({ from: 'lp-search', q: '', search: '?view=offers' });
  });

  it('shows no holdings and disables the LP chips when the Character holds no LP', async () => {
    landing.mockReturnValue(state({ stores: [NAVY, { ...SISTERS, yourLp: null }] }));
    const user = userEvent.setup();
    renderLanding();
    expect(screen.queryByText('Your LP', { selector: 'dt, span' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('button', { name: /Stores I hold LP with/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('lists one offer id sold by two stores as two rows', () => {
    const sisters = offer(SISTERS, 21, 'Navy Cap Booster 800', 1100, 410);
    landing.mockReturnValue(state({ offers: [OFFERS[1]!, sisters] }));
    renderLanding('?view=offers');
    expect(rowNames(screen.getByRole('table', { name: 'LP Store offers' }))).toHaveLength(2);
  });

  it('sorts by Store nearest first on the first click', async () => {
    const far = store({ corporationId: 3, name: 'Far Navy', nearest: { systemId: 1, jumps: 30 } });
    landing.mockReturnValue(state({ offers: [offer(far, 31, 'Far Thing', 1500, 50), OFFERS[1]!] }));
    const user = userEvent.setup();
    renderLanding('?view=offers');
    const table = screen.getByRole('table', { name: 'LP Store offers' });
    await user.click(within(table).getByRole('button', { name: /^Store/ }));
    expect(rowNames(table)[0]).toContain('Navy Cap Booster 800');
  });

  it('waits for the balances before applying a linked I can afford', () => {
    landing.mockReturnValue(state({ balancesKnown: false }));
    renderLanding('?view=offers&affordable=1');
    expect(screen.queryByText('Nothing matches')).toBeNull();
    expect(screen.queryByRole('table', { name: 'LP Store offers' })).toBeNull();
  });

  it('says why the page is empty when the snapshot is unavailable', () => {
    landing.mockReturnValue(state({ status: 'unavailable', stores: [], offers: [] }));
    renderLanding();
    expect(screen.getByText("LP Stores aren't available")).toBeInTheDocument();
  });
});
