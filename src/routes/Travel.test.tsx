import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as routeChunks from '@/app/routeChunks';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import en from '@/i18n/locales/en.json';
import { App } from '@/app/App';
import { useDefaultRoutePreference } from '@/features/route/routeRules';
import { ESI, server, routeFact, visit, installTravelHarness } from '@/test/travelPage';
import {
  JITA,
  PERIMETER,
  UEDAMA,
  THERA,
  NIYABAINEN,
  MUVOLAILEN,
  SOBASEKI,
  travelState,
  loadSolarSystemJumps,
  incursion,
} from '@/test/travelMocks';
import { useIncursionsPanelOpen } from '@/features/travel/incursionsData';

vi.mock('virtual:pwa-register/react', async () =>
  (await import('@/test/travelMocks')).pwaRegisterMock()
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/travelMocks')).loadSdeMock());
vi.mock('@/features/travel/useLawlessSystems', async () =>
  (await import('@/test/travelMocks')).lawlessSystemsMock()
);
vi.mock('@/sde/loadMarketSde', async (importOriginal) =>
  (await import('@/test/travelMocks')).loadMarketSdeMock(
    await importOriginal<typeof import('@/sde/loadMarketSde')>()
  )
);
vi.mock('@/features/market/useHaulingScan', async () =>
  (await import('@/test/travelMocks')).haulingScanMock()
);
vi.mock('@/features/market/useHaulingFillScan', async () =>
  (await import('@/test/travelMocks')).haulingFillScanMock()
);
vi.mock('@/features/market/useHubJumps', async () =>
  (await import('@/test/travelMocks')).hubJumpsMock()
);

installTravelHarness();

describe('Travel › Route Safety', () => {
  describe('before a route exists', () => {
    it('asks for the destination in a field already on the page, not behind Add stop', async () => {
      visit(`?from=${JITA}`);

      expect(await screen.findByRole('combobox', { name: /^destination/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^add stop/i })).toBeNull();
      expect(
        screen.getByRole('heading', { name: 'Pick where the route starts and ends' })
      ).toBeInTheDocument();
    });

    it('shows the three preference cards with dashes, the saved one selected', async () => {
      visit(`?from=${JITA}`);

      const group = await screen.findByRole('radiogroup', { name: 'Route preference' });
      const cards = within(group).getAllByRole('radio');
      expect(cards).toHaveLength(3);
      for (const name of [/^Safer/, /^Shorter/, /^Less secure/]) {
        expect(within(group).getByRole('radio', { name })).toBeInTheDocument();
      }
      expect(within(group).getByRole('radio', { name: /^Safer/ })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      expect(within(cards[0]).getAllByText('—')).toHaveLength(4);
    });

    it('offers the trade hubs as quick picks and starts a route from one', async () => {
      const user = userEvent.setup({ delay: null });
      visit(`?from=${PERIMETER}`);

      const picks = await screen.findByRole('group', { name: 'Go to' });
      expect(within(picks).getByRole('button', { name: 'Jita' })).toBeInTheDocument();
      await user.click(within(picks).getByRole('button', { name: 'Jita' }));

      expect(
        await screen.findByRole('table', { name: 'Systems on the route' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Go to' })).toBeNull();
    });
  });

  describe('preference cards', () => {
    it("plans the same trip once per preference and states each one's facts", async () => {
      visit(`?from=${JITA}&to=${UEDAMA}`);

      const group = await screen.findByRole('radiogroup', { name: 'Route preference' });
      await waitFor(() => {
        for (const card of within(group).getAllByRole('radio')) {
          expect(within(card).queryByText('—')).toBeNull();
        }
      });
      // One gate chain: all three preferences fly the same route, and say so.
      expect(within(group).getAllByText(/^Same route as/)).toHaveLength(2);
      expect(
        within(group)
          .getAllByRole('radio')
          .every((card) => /2/.test(card.textContent ?? ''))
      ).toBe(true);
    });

    it('is one tab stop, and the arrow keys move the choice between the cards', async () => {
      const user = userEvent.setup({ delay: null });
      visit(`?from=${JITA}&to=${UEDAMA}`);

      const group = await screen.findByRole('radiogroup', { name: 'Route preference' });
      const safer = within(group).getByRole('radio', { name: /^Safer/ });
      const shorter = within(group).getByRole('radio', { name: /^Shorter/ });
      expect(safer).toHaveAttribute('tabindex', '0');
      expect(shorter).toHaveAttribute('tabindex', '-1');

      safer.focus();
      await user.keyboard('{ArrowRight}');
      await waitFor(() => expect(shorter).toHaveAttribute('aria-checked', 'true'));
      expect(shorter).toHaveFocus();
      expect(shorter).toHaveAttribute('tabindex', '0');
      expect(safer).toHaveAttribute('tabindex', '-1');
    });

    it("saves the chosen card as the pilot's Route Preference, as the rules control does", async () => {
      const user = userEvent.setup({ delay: null });
      visit(`?from=${JITA}&to=${UEDAMA}`);

      const group = await screen.findByRole('radiogroup', { name: 'Route preference' });
      await user.click(within(group).getByRole('radio', { name: /^Shorter/ }));

      await waitFor(() =>
        expect(within(group).getByRole('radio', { name: /^Shorter/ })).toHaveAttribute(
          'aria-checked',
          'true'
        )
      );
      expect(useDefaultRoutePreference.getState().value).toBe('shortest');
    });
  });

  it('lists every system on the route in order with its last hour of activity', async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const rows = await within(table).findAllByRole('row');
    const body = rows.slice(1);
    expect(body.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      'Jita',
      'Perimeter',
      expect.stringContaining('Uedama'),
    ]);

    const uedama = within(body[2]);
    expect(await uedama.findByText('12')).toBeInTheDocument();
    expect(uedama.getByText('900')).toBeInTheDocument();
    expect(uedama.getByText('Gank Chokepoint')).toBeInTheDocument();
    expect(await uedama.findByText('The Citadel')).toBeInTheDocument();
    expect(within(body[0]).getByText('The Forge')).toBeInTheDocument();

    expect(routeFact('Chokepoints')).toBe('Uedama');
    expect(routeFact('Jumps')).toBe('2');
    expect(routeFact('High')).toBe('3');
    expect(routeFact('Low')).toBe('0');
    expect(routeFact('Null')).toBe('0');
    expect(routeFact('Lowest')).toBe('0.5');
    expect(routeFact('Kills 1h')).toBe('12 ship · 4 pod');
  });

  it('tags a lawless system on its row, and nothing when none is listed', async () => {
    travelState.lawlessSystems = new Set([PERIMETER]);
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const body = (await within(table).findAllByRole('row')).slice(1);
    expect(await within(body[1]).findByText('Lawless')).toBeInTheDocument();
    expect(within(body[0]).queryByText('Lawless')).toBeNull();
    expect(within(body[2]).queryByText('Lawless')).toBeNull();
  });

  it('shows no lawless tag when the list is empty', async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await screen.findByRole('table', { name: 'Systems on the route' });
    expect(screen.queryByText('Lawless')).toBeNull();
  });

  it('draws the route strip with a spoken description and its key systems', async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    expect(
      await screen.findByRole('img', {
        name: 'Route strip, 3 systems from Jita to Uedama. Key systems: Jita 0.9, Uedama 0.5, Gank Chokepoint. Kills in the last hour in: Uedama.',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('route-strip-cell')).toHaveLength(3);
  });

  it('opens NPC kills and kills off the route in the row detail', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const body = (await within(table).findAllByRole('row')).slice(1);
    await within(body[2]).findByRole('link', { name: /^2 player kills\s*\(opens/ });
    await user.click(within(body[2]).getByText('Uedama'));
    expect(await within(table).findByText('NPC kills in the last hour: 2')).toBeInTheDocument();
    expect(
      within(table).getByText('No zKillboard kills elsewhere in the system in the last hour.')
    ).toBeInTheDocument();
  });

  it('folds a quiet stretch into one row that opens in place', async () => {
    const user = userEvent.setup({ delay: null });
    loadSolarSystemJumps.mockResolvedValue({
      [JITA]: [NIYABAINEN],
      [NIYABAINEN]: [JITA, MUVOLAILEN],
      [MUVOLAILEN]: [NIYABAINEN, SOBASEKI],
      [SOBASEKI]: [MUVOLAILEN],
    });
    visit(`?from=${JITA}&to=${SOBASEKI}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const fold = await within(table).findByRole('button', {
      name: '2 systems · Niyabainen → Muvolailen · lowest 0.6 · no kills reported in the last hour',
    });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(within(table).queryByText('Niyabainen')).not.toBeInTheDocument();
    // The ends never fold.
    expect(within(table).getByText('Jita')).toBeInTheDocument();
    expect(within(table).getByText('Sobaseki')).toBeInTheDocument();

    await user.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(within(table).getByText('Niyabainen')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Avoid Muvolailen' })).toBeInTheDocument();
  });

  it("fills in each system's zKillboard kills by location, one row at a time", async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const body = (await within(table).findAllByRole('row')).slice(1);

    const uedama = within(body[2]);
    const count = await uedama.findByRole('link', { name: /^2 player kills\s*\(opens/ });
    expect(count).toHaveAttribute('href', `https://zkillboard.com/system/${UEDAMA}/`);
    expect(
      await uedama.findByText('2 kills at Stargate (Perimeter), last one 12 min ago')
    ).toBeInTheDocument();
    expect(uedama.getByText('On your route')).toBeInTheDocument();
    expect(uedama.getByText('Smartbombs involved')).toBeInTheDocument();

    // A rate-limited system says so on its own row; the rest still fill in.
    expect(
      await within(body[1]).findByText('zKillboard is rate-limiting requests. Try again shortly.')
    ).toBeInTheDocument();
    expect(
      await within(body[0]).findByRole('link', { name: /^0 player kills\s*\(opens/ })
    ).toBeInTheDocument();
  });

  it('starts from the Current System when the link names no start', async () => {
    visit(`?to=${UEDAMA}`);

    expect(await screen.findByRole('table', { name: 'Systems on the route' })).toBeInTheDocument();
    expect(await screen.findByText('Jita (current system)')).toBeInTheDocument();
  });

  it('says so when start and destination are the same system', async () => {
    visit(`?from=${JITA}&to=${JITA}`);

    expect(
      await screen.findByText('Start and destination are the same system')
    ).toBeInTheDocument();
  });

  it('says no stargate route exists, distinct from not knowing', async () => {
    visit(`?from=${JITA}&to=${THERA}`);

    expect(await screen.findByText('No stargate route connects these systems')).toBeInTheDocument();
  });

  it('says the route cannot be worked out when the stargate map is unreadable', async () => {
    loadSolarSystemJumps.mockRejectedValue(new Error('offline'));
    visit(`?from=${JITA}&to=${UEDAMA}`);

    expect(await screen.findByText("This route can't be worked out right now")).toBeInTheDocument();
  });

  it('opens Route Safety from the bare /travel path', async () => {
    window.history.pushState({}, '', '/travel');
    render(<App />);

    expect(await screen.findByText('Pick where the route starts and ends')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/travel/route');
  });

  it('opens Pilot Lookup from a bare /travel?pilot= link', async () => {
    server.use(
      http.get(`${ESI}/characters/42`, () =>
        HttpResponse.json({
          name: 'Some Pilot',
          birthday: '2010-01-01T00:00:00Z',
          corporation_id: 200,
          bloodline_id: 1,
          gender: 'male',
          race_id: 1,
        })
      ),
      http.post(`${ESI}/characters/affiliation`, () =>
        HttpResponse.json([{ character_id: 42, corporation_id: 200 }])
      ),
      http.post(`${ESI}/universe/names`, () =>
        HttpResponse.json([{ id: 200, name: 'Some Corp', category: 'corporation' }])
      ),
      http.get('https://zkillboard.com/api/stats/characterID/42/', () =>
        HttpResponse.json({ error: 'Invalid type or id' })
      )
    );
    window.history.pushState({}, '', '/travel?pilot=42');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Some Pilot' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/travel/pilot');
    expect(window.location.search).toBe('?pilot=42');
    expect(await screen.findByText('No kills or losses on zKillboard')).toBeInTheDocument();
  });
});

describe('Travel › Route Safety › Incursions near you', () => {
  const stopsInLink = () => new URLSearchParams(window.location.search).get('stops');
  // The fold is remembered per device: each test starts folded.
  beforeEach(() => useIncursionsPanelOpen.setState({ value: false, hydrated: false }));

  it('is folded by default but still names the nearest incursion', async () => {
    travelState.incursions = [incursion(20000020, UEDAMA, 'established')];
    visit(`?from=${JITA}`);

    expect(await screen.findByText(/^Nearest: Uedama, \d+ jumps?$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show incursions' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('lists each incursion with its state as a word and its jumps from the current system', async () => {
    const user = userEvent.setup({ delay: null });
    travelState.incursions = [
      incursion(20000021, THERA, 'withdrawing'),
      incursion(20000020, UEDAMA, 'mobilizing'),
    ];
    visit(`?from=${JITA}`);

    await user.click(await screen.findByRole('button', { name: 'Show incursions' }));
    const list = await screen.findByRole('list', { name: 'Active incursions' });
    const rows = within(list).getAllByRole('listitem');
    // Thera has no stargate route: it sorts last and says so, never "0 jumps".
    expect(within(rows[0]).getByText('Uedama')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Mobilizing')).toBeInTheDocument();
    expect(await within(rows[0]).findByText(/^\d+ jumps?$/)).toBeInTheDocument();
    expect(within(rows[1]).getByText('Withdrawing')).toBeInTheDocument();
    expect(await within(rows[1]).findByText('No route with your route rules')).toBeInTheDocument();
  });

  it('adds the staging system as a stop and moves focus to the stops', async () => {
    const user = userEvent.setup({ delay: null });
    travelState.incursions = [incursion(20000020, UEDAMA, 'established')];
    visit(`?from=${JITA}`);

    await user.click(await screen.findByRole('button', { name: 'Show incursions' }));
    await user.click(await screen.findByRole('button', { name: 'Route to Uedama' }));

    expect(stopsInLink()).toBe(String(UEDAMA));
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Stops, in the order typed' })).toHaveFocus()
    );
    expect(screen.getByText('On route')).toBeInTheDocument();
  });

  it('says the feed could not be read, with a retry, rather than claiming none are active', async () => {
    const user = userEvent.setup({ delay: null });
    travelState.incursions = null;
    visit(`?from=${JITA}`);

    await user.click(await screen.findByRole('button', { name: 'Show incursions' }));
    expect(
      (await screen.findAllByText('The incursion feed could not be read. Try again in a moment.'))
        .length
    ).toBeGreaterThan(0);
    travelState.incursions = [incursion(20000020, UEDAMA, 'established')];
    await user.click(screen.getByRole('button', { name: en.common.retry }));
    expect(await screen.findByRole('list', { name: 'Active incursions' })).toBeInTheDocument();
  });
});

describe('Travel › Hauling (moved back to Market, #4702)', () => {
  // The redirect lands on Market, a route this file otherwise never loads; its
  // lazy chunks cost over a second inside the test.
  beforeAll(() => routeChunks.loadMarket(), 30_000);

  it('has only Route Safety and Pilot Lookup tabs', async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);
    const strip = await screen.findByRole('tablist', { name: 'Travel' });
    expect(
      within(strip)
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual([en.travel.routeTab, en.nav.pilotLookup]);
  });

  it('moves an old Travel Hauling link to Market, keeping its query and hash', async () => {
    window.history.pushState({}, '', '/travel/hauling?from=amarr&to=jita#x');
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Hauling' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(window.location.pathname).toBe('/market/hauling');
    expect(window.location.search).toBe('?from=amarr&to=jita');
    expect(window.location.hash).toBe('#x');
  });
});

describe('Travel copy', () => {
  it('states conditions, never verdicts', () => {
    const strings: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === 'string') strings.push(node);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    const catalog = en as unknown as Record<string, Record<string, unknown>>;
    // Everything the page shows: its own section, its nav entry, and the
    // Route Preference labels it borrows from Contract Search. Pilot Lookup
    // (`travel.pilot`) is checked by its own test: it names zKillboard's
    // "danger ratio" statistic, which is a figure, not a verdict.
    walk(Object.entries(catalog.travel).filter(([key]) => key !== 'pilot'));
    walk([catalog.nav.travel]);
    walk(catalog.contractSearch.routePreference);
    for (const text of strings) {
      expect(text, text).not.toMatch(/\b(safe|safest|unsafe|dangerous|danger|camp\w*)\b/i);
    }
  });
});
