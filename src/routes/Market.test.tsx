import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useMarketHub } from '@/features/market/hub';
import { clearMarketPriceCache } from '@/market/prices';
import { FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { App } from '@/app/App';
import { Market } from './Market';
import type { TypeMap } from '@/sde/types';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const TYPES: TypeMap = {
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
  '36': { name: 'Mexallon', groupID: 18, volume: 0.01 },
};

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => ({})),
}));

function pricedHandler(stationCalls: string[]) {
  return http.get(FUZZWORK_AGGREGATES_URL, ({ request }) => {
    const url = new URL(request.url);
    stationCalls.push(url.searchParams.get('station') ?? '');
    return HttpResponse.json({
      34: {
        sell: { min: '1000000', volume: '5000', orderCount: '3' },
        buy: { max: '900000', volume: '3000', orderCount: '2' },
      },
    });
  });
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  // Market needs no ESI scope and no *active* Character, but the feature area
  // sits behind RequireCharacter, so one must exist for the route to render.
  await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  clearMarketPriceCache();
  window.history.pushState({}, '', '/market');
});

async function pinTritanium(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByRole('searchbox'), 'trit');
  await user.click(await screen.findByRole('button', { name: 'Pin' }));
}

describe('Market Browser', () => {
  it('filters SDE type names case-insensitively as a substring match', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole('searchbox'), 'trit');

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });

  it('pins a result into the compare table, and unpins it back to empty', async () => {
    server.use(pricedHandler([]));
    const user = userEvent.setup();
    render(<App />);

    await pinTritanium(user);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Tritanium')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: 'Unpin' }));

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders sell/buy/spread/volume for a priced pinned item', async () => {
    server.use(pricedHandler([]));
    const user = userEvent.setup();
    render(<App />);

    await pinTritanium(user);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('1,000,000')).toBeInTheDocument();
    expect(within(table).getByText('900,000')).toBeInTheDocument();
    expect(within(table).getByText('+10.0%')).toBeInTheDocument();
    expect(within(table).getByText('5,000')).toBeInTheDocument();
    expect(within(table).getByText('3,000')).toBeInTheDocument();
  });

  it('refetches pinned prices at the new station when the trade hub is switched, and persists the choice', async () => {
    const stationCalls: string[] = [];
    server.use(pricedHandler(stationCalls));
    const user = userEvent.setup();
    render(<App />);

    await pinTritanium(user);
    await screen.findByRole('table');
    expect(stationCalls).toContain('60003760'); // Jita

    await user.selectOptions(screen.getByLabelText('Trade Hub'), 'amarr');

    await vi.waitFor(() => expect(stationCalls).toContain('60008494')); // Amarr
    expect((await db.settings.get('marketHub'))?.value).toBe('amarr');
  });

  it('honors a hub persisted from a previous session, fetching only at that station', async () => {
    await db.settings.put({ key: 'marketHub', value: 'amarr' });
    const stationCalls: string[] = [];
    server.use(pricedHandler(stationCalls));
    const user = userEvent.setup();
    render(<App />);

    await pinTritanium(user);
    await screen.findByRole('table');

    // Not ['60003760', '60008494'] — hydration gating means the default hub
    // (Jita) never fires a throwaway fetch before the persisted hub loads.
    expect(stationCalls).toEqual(['60008494']); // Amarr only
  });

  it('Refresh bypasses the 15-min price cache and refetches immediately', async () => {
    const stationCalls: string[] = [];
    server.use(pricedHandler(stationCalls));
    const user = userEvent.setup();
    render(<App />);

    await pinTritanium(user);
    await screen.findByRole('table');
    expect(stationCalls).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await vi.waitFor(() => expect(stationCalls).toHaveLength(2));
  });

  it('shows an empty state instead of an all-dashes table when prices are unreachable (offline)', async () => {
    server.use(http.get(FUZZWORK_AGGREGATES_URL, () => HttpResponse.error()));
    const user = userEvent.setup();
    render(<App />);

    await pinTritanium(user);

    expect(await screen.findByText('No price data cached')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Market search focus (issue #25 "jump to search" shortcut)', () => {
  it('focuses the search box when navigated here with focusSearch router state', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/market', state: { focusSearch: true } }]}>
        <Market />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
  });

  it('leaves focus alone on an ordinary visit', async () => {
    render(
      <MemoryRouter initialEntries={['/market']}>
        <Market />
      </MemoryRouter>
    );

    expect(await screen.findByRole('searchbox')).not.toHaveFocus();
  });
});
