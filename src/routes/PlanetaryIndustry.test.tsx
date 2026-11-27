import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useAuthFailure } from '@/stores/authFailure';
import { DEFAULT_PI_CADENCE, PI_CADENCE_KEY, useCadence } from '@/features/pi/cadencePref';
import {
  useShowAltColonies,
  DEFAULT_PI_COLONIES_SHOW_ALTS,
  PI_COLONIES_SHOW_ALTS_KEY,
} from '@/features/pi/showAltColoniesPref';
import { App } from '@/app/App';
import { renderIndustryRoutes } from '@/test/industryRoutes';
import { piTier } from '@/engine/pi/chain';
import * as routeChunks from '@/app/routeChunks';
import { loadPlanPrices } from '@/features/pi/planPrices';
import type { PiData } from '@/sde/types';
import { DAY_MS } from '@/lib/age';

const WATER = 3645;
const WATER_NAME = 'Water';
const TRANSMITTER = 9840;
const TRANSMITTER_NAME = 'Transmitter';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const piData = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => piData),
  loadPiPlanetRadius: vi.fn(async () => ({ [String(40000001)]: 5_000 })),
  loadPiSystemPlanets: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

vi.mock('@/features/pi/planPrices', () => ({
  loadPlanPrices: vi.fn(async (_hub: unknown, typeIds: number[]) => {
    const prices: Record<number, number> = {};
    const buyPrices: Record<number, number> = {};
    for (const typeId of typeIds) {
      const price = [5, 760, 14_000, 100_000, 1_900_000][piTier(typeId, piData)];
      prices[typeId] = price;
      buyPrices[typeId] = price * 0.95;
    }
    return { prices, buyPrices, unpriced: [], failed: false, fetchedAt: new Date() };
  }),
}));

const JUMP_BASIS = vi.hoisted(() => ({
  rules: {},
  network: {},
  key: 'test',
  hydrated: true,
  podKillsUnavailable: false,
}));
vi.mock('@/features/route/jumpBasis', () => ({
  useSharedJumpBasis: () => JUMP_BASIS,
  JumpBasisProvider: ({ children }: { children: React.ReactNode }) => children,
  jumpsBetween: vi.fn(async () => ({ kind: 'known', jumps: 7 })),
}));

const CHAR_ID = 91;
const ESI = 'https://esi.evetech.net';
const PLANET_ID = 40000001;
const SYSTEM_ID = 30000142;

const planetsPayload = [
  {
    solar_system_id: SYSTEM_ID,
    planet_id: PLANET_ID,
    planet_type: 'temperate' as const,
    owner_id: CHAR_ID,
    last_update: '2026-08-30T00:00:00Z',
    upgrade_level: 3,
    num_pins: 1,
  },
];

const EXPIRED_TIME = '2020-01-01T00:00:00Z';

const detailPayload = {
  links: [],
  pins: [
    {
      pin_id: 1,
      type_id: 2848,
      latitude: 0,
      longitude: 0,
      expiry_time: EXPIRED_TIME,
      extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
    },
  ],
  routes: [],
};

const PRODUCT_ID = 2307;
const FACTORY_TYPE_ID = 3001;
const STORAGE_TYPE_ID = 3002;
const SCHEMATIC_ID = 131;

const NAMES: Record<number, { name: string; category: string }> = {
  [SYSTEM_ID]: { name: 'Jita', category: 'solar_system' },
  2848: { name: 'Extractor Control Unit', category: 'inventory_type' },
  [PRODUCT_ID]: { name: 'Felsic Magma', category: 'inventory_type' },
  [FACTORY_TYPE_ID]: { name: 'Basic Industry Facility', category: 'inventory_type' },
  [STORAGE_TYPE_ID]: { name: 'Storage Facility', category: 'inventory_type' },
};

const roleCardsDetailPayload = {
  links: [],
  routes: [],
  pins: [
    { pin_id: 10, type_id: FACTORY_TYPE_ID, latitude: 0, longitude: 0, schematic_id: SCHEMATIC_ID },
    { pin_id: 11, type_id: FACTORY_TYPE_ID, latitude: 0, longitude: 0, schematic_id: SCHEMATIC_ID },
    { pin_id: 12, type_id: STORAGE_TYPE_ID, latitude: 0, longitude: 0 },
  ],
};

const BASE_NOW = Date.now();

const agedDetailPayload = {
  links: [],
  pins: [
    {
      pin_id: 2,
      type_id: 2848,
      latitude: 0,
      longitude: 0,
      install_time: new Date(BASE_NOW - DAY_MS - 60_000).toISOString(),
      expiry_time: new Date(BASE_NOW + 13 * DAY_MS).toISOString(),
      extractor_details: {
        heads: [{ head_id: 1, latitude: 0, longitude: 0 }],
        product_type_id: PRODUCT_ID,
        qty_per_cycle: 6965,
        cycle_time: 1800,
      },
    },
  ],
  routes: [],
};

const decayedDetailPayload = {
  ...agedDetailPayload,
  pins: [
    {
      ...agedDetailPayload.pins[0],
      install_time: new Date(BASE_NOW - 5 * DAY_MS - 60_000).toISOString(),
      expiry_time: new Date(BASE_NOW + 9 * DAY_MS).toISOString(),
    },
  ],
};

const server = setupServer(
  http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json(planetsPayload)),
  http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
    HttpResponse.json(detailPayload)
  ),
  http.get(`${ESI}/universe/planets/${PLANET_ID}`, () =>
    HttpResponse.json({
      planet_id: PLANET_ID,
      name: 'Jita IV',
      system_id: SYSTEM_ID,
      type_id: 11,
      position: { x: 0, y: 0, z: 0 },
    })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json({
      skills: [
        {
          skill_id: 33467,
          trained_skill_level: 4,
          active_skill_level: 4,
          skillpoints_in_skill: 90510,
        },
      ],
      total_sp: 90510,
    })
  ),
  http.post(`${ESI}/universe/names`, async ({ request }) => {
    const ids = (await request.json()) as number[];
    return HttpResponse.json(ids.filter((id) => NAMES[id]).map((id) => ({ id, ...NAMES[id] })));
  }),
  http.get(`${ESI}/characters/${CHAR_ID}/corporationhistory`, () => HttpResponse.json([])),
  http.get(`${ESI}/universe/systems/${SYSTEM_ID}`, () =>
    HttpResponse.json({
      system_id: SYSTEM_ID,
      name: 'Jita',
      security_status: 0.95,
      constellation_id: 20000020,
      star_id: 40009076,
    })
  )
);

const plannableDetailPayload = {
  links: [{ source_pin_id: 3, destination_pin_id: 2, link_level: 0 }],
  routes: [],
  pins: [
    {
      ...agedDetailPayload.pins[0],
      latitude: 0.2,
      longitude: 0.4,
      extractor_details: {
        ...agedDetailPayload.pins[0].extractor_details,
        heads: Array.from({ length: 6 }, (_, i) => ({ head_id: i, latitude: 0, longitude: 0 })),
        product_type_id: 2268,
      },
    },
    { pin_id: 3, type_id: 2256, latitude: 0.5, longitude: 0.9 },
  ],
};

async function resetSession(): Promise<void> {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useShowAltColonies.setState({ value: DEFAULT_PI_COLONIES_SHOW_ALTS, hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-planets.manage_planets.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/planetary-industry/colonies');
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  await routeChunks.loadPlanetaryIndustry();
  await resetSession();
  window.history.pushState({}, '', '/planetary-industry/plan');
  const { unmount } = render(<App />);
  await screen.findByRole('heading', { name: 'What do you want to do?' }, { timeout: 25_000 });
  unmount();
  window.history.pushState({}, '', '/planetary-industry/map');
  const warmMap = await renderIndustryRoutes();
  await screen.findByRole('group', { name: /^Planet map/ }, { timeout: 25_000 });
  warmMap.unmount();
  window.history.pushState({}, '', '/planetary-industry/plan?q=find-best');
  const warmPlan = await renderIndustryRoutes();
  await waitFor(() => expect(document.querySelector('a[href*="product="]')).not.toBeNull(), {
    timeout: 25_000,
  });
  warmPlan.unmount();
  server.resetHandlers();
}, 60_000);
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  useAuthFailure.setState({ failure: null });
  await db.settings.delete(PI_CADENCE_KEY);
  useCadence.setState({ value: DEFAULT_PI_CADENCE, hydrated: false });
  await resetSession();
});

const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';

async function addAlt(characterId: number, name: string, scopes: string[]) {
  await db.characters.put({
    characterId,
    name,
    ownerHash: `oh${characterId}`,
    addedAt: characterId,
  });
  await db.tokens.put({
    characterId,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes,
  });
}

async function colonyPanelFor(name: RegExp): Promise<HTMLElement> {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toHaveAttribute('aria-disabled')
  );
  const heading = await screen.findByRole('heading', { name });
  const panel = heading.closest('[data-colony-status]');
  if (!(panel instanceof HTMLElement)) throw new Error(`no colony panel for ${String(name)}`);
  const trigger = within(panel).getByRole('button', { name: /^Show details for / });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  await within(panel).findByRole('region');
  return panel;
}

function coloniesPanel(): HTMLElement {
  const heading = screen.getByRole('heading', { name: /^\d+ colon(y|ies)$/i });
  const panel = heading.closest('section');
  if (!(panel instanceof HTMLElement)) throw new Error('no colonies panel found');
  return panel;
}

describe('PlanetaryIndustry', () => {
  it('lists a colony with its planet, and shows the extractor as stopped from expiry_time alone', async () => {
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    expect(panel).toHaveAttribute('data-colony-status', 'stopped');
    expect(within(panel).getByRole('link', { name: 'Jita IV' })).toHaveAttribute(
      'href',
      expect.stringContaining('/travel/route')
    );
    expect(within(panel).getByText('Stopped', { selector: 'span' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /^Restart/ })).toBeInTheDocument();
    expect(within(panel).getAllByText('Unknown product').length).toBeGreaterThan(0);
  });

  it("explains what the page can't see, in plain words", async () => {
    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    await userEvent
      .setup()
      .hover(screen.getAllByRole('button', { name: 'About colony data freshness' })[0]);
    expect(
      (await screen.findAllByText(/the game only updates a colony's storage and extractors/)).length
    ).toBeGreaterThan(0);
  });

  it('reads a colony with no readable extraction program as unknown storage, never blank', async () => {
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText("Can't tell yet")).toBeInTheDocument();
  });

  it('leads with the next thing to do, and when to log in', async () => {
    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const heading = screen.getByRole('heading', { name: "Today's check" });
    const today = heading.closest('section');
    if (!(today instanceof HTMLElement)) throw new Error('no Today panel');
    expect(within(today).getByText(/^Restart Jita IV/)).toBeInTheDocument();
    expect(within(today).getByText('Log in next')).toBeInTheDocument();
    expect(within(today).getByText('Now')).toBeInTheDocument();
    expect(within(today).getAllByText('Stopped').length).toBeGreaterThan(0);
    expect(within(today).queryAllByRole('button', { name: /Jita IV/ })).toHaveLength(0);
  });

  it('names the haul cadence beside the log-in time, and changes it from there', async () => {
    const user = userEvent.setup({ delay: null });
    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const today = screen
      .getByRole('heading', { name: "Today's check" })
      .closest('section') as HTMLElement;
    await user.click(within(today).getByRole('combobox', { name: 'You haul' }));
    await user.click(await screen.findByRole('option', { name: 'once a week' }));
    await waitFor(() =>
      expect(within(today).getByRole('combobox', { name: 'You haul' })).toHaveTextContent(
        'once a week'
      )
    );
  });

  it('shows the empty state when there are no colonies', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json([])));
    await renderIndustryRoutes();
    expect(await screen.findByText('No colonies yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Find the best thing to build/ })).toHaveAttribute(
      'href',
      '/planetary-industry/plan'
    );
  });

  it('shows a re-login prompt when the planets scope itself was revoked', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    await renderIndustryRoutes();
    expect(await screen.findByText(/: log in again$/)).toBeInTheDocument();
  });

  it('shows the alt-colonies toggle alongside the re-login prompt, not instead of it, when an alt has cached colonies', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: detailPayload,
      fetchedAt: Date.now(),
    });

    await renderIndustryRoutes();

    expect((await screen.findAllByText(/: log in again$/)).length).toBeGreaterThan(0);
    const toggle = await screen.findByRole('button', { name: /show \d+ alt/i });

    const user = userEvent.setup({ delay: null });
    await user.click(toggle);
    const altRow = screen.getByRole('button', {
      name: new RegExp(`^Show details for Planet #${ALT_PLANET_ID}`),
    });
    expect(altRow).toHaveAttribute('aria-expanded', 'false');

    await user.click(altRow);
    expect(altRow).toHaveAttribute('aria-expanded', 'true');
    expect(within(coloniesPanel()).getByRole('region')).toBeInTheDocument();
  });

  it("opens a colony's ⋮ menu by right-click on the row too, but leaves its links to the browser", async () => {
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    const row = within(panel)
      .getByRole('button', { name: /^Show details for / })
      .closest('[data-colony-status] > div');
    if (!row) throw new Error('no row');
    const link = within(panel).getAllByRole('link')[0];
    const onLink = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    link.dispatchEvent(onLink);
    expect(onLink.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    fireEvent.contextMenu(row);
    expect(await screen.findByRole('menuitem', { name: 'Hide details' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Plan this colony' })).toBeInTheDocument();
  });

  it('leaves both yield figures blank for an extractor with no install-time baseline', async () => {
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    const region = within(panel).getByRole('region');
    expect(within(region).getAllByText('—')).toHaveLength(2);
    expect(within(panel).queryByText('0 (0%)')).not.toBeInTheDocument();
  });

  it('shows banked yield, its share of the program, and the daily gain from resetting now', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(agedDetailPayload)
      )
    );
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('513,262 (27%)')).toBeInTheDocument();
    expect(within(panel).getByText('+793,859 units/day')).toBeInTheDocument();
    const region = within(panel).getByRole('region');
    expect(within(region).queryByText('—')).not.toBeInTheDocument();
  });

  it('flags a colony whose extractors are all past the efficient window as needing a look', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    expect(panel).toHaveAttribute('data-colony-status', 'needs-look');
    expect(within(panel).getByText('Needs a look')).toBeInTheDocument();
    expect(within(panel).getByText(/slowed to \d+% of its first day/)).toBeInTheDocument();
    expect(within(panel).queryByText('Healthy')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Stopped', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('leaves a colony one day into its program healthy, not needing a look', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json({
          ...agedDetailPayload,
          pins: [
            ...agedDetailPayload.pins,
            { pin_id: 3, type_id: 2256, latitude: 0.5, longitude: 0.9 },
          ],
        })
      )
    );
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    expect(panel).toHaveAttribute('data-colony-status', 'healthy');
    expect(within(panel).getByText('Healthy')).toBeInTheDocument();
    expect(within(panel).queryByText('Needs a look')).not.toBeInTheDocument();
  });

  it('names each extractor by its product, as a link to its PI detail, not by the extractor pin type', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    const region = within(panel).getByRole('region');
    expect(within(region).getByRole('link', { name: 'Felsic Magma' })).toHaveAttribute(
      'href',
      `/planetary-industry/map?product=${PRODUCT_ID}`
    );
    expect(within(panel).queryByText('Extractor Control Unit')).not.toBeInTheDocument();
  });

  it('groups factory pins into one Production row per schematic, with a facility count', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(roleCardsDetailPayload)
      )
    );
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    const region = within(panel).getByRole('region');
    expect(within(region).getByText('Bacteria')).toBeInTheDocument();
    expect(within(region).getByText(/^2×/)).toBeInTheDocument();
  });

  it('shows an unknown status rather than a confident Healthy when a colony detail failed to load', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () => HttpResponse.error())
    );
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    expect(panel).toHaveAttribute('data-colony-status', 'unknown');
    expect(within(panel).getByText('Unknown', { selector: 'span' })).toBeInTheDocument();
    expect(within(panel).queryByText('Healthy')).not.toBeInTheDocument();
  });

  it('pairs the no-pin-data title with a hint on why it happened, not just the title alone', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () => HttpResponse.error())
    );
    await renderIndustryRoutes();
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('No buildings loaded for this colony')).toBeInTheDocument();
    expect(within(panel).getByText("Refresh to load this colony's buildings.")).toBeInTheDocument();
  });

  it("lists an alt's cached programs beside the active character's, without fetching for it", async () => {
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    const altPlanetsFetch = vi.fn();
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: {
        links: [],
        routes: [],
        pins: [
          {
            pin_id: 9,
            type_id: 2848,
            latitude: 0,
            longitude: 0,
            expiry_time: new Date(BASE_NOW + 5 * DAY_MS).toISOString(),
            extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
          },
        ],
      },
      fetchedAt: Date.now(),
    });
    server.use(
      http.get(`${ESI}/characters/${ALT_ID}/planets`, () => {
        altPlanetsFetch();
        return HttpResponse.json([]);
      })
    );

    const { unmount } = await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    const panel = coloniesPanel();
    expect(within(panel).getByText('Pilot One')).toBeInTheDocument();
    expect(within(panel).getByText('Alt Two')).toBeInTheDocument();
    expect(altPlanetsFetch).not.toHaveBeenCalled();

    unmount();
    useShowAltColonies.setState({ hydrated: false });
    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    expect(await within(coloniesPanel()).findByText('Alt Two')).toBeInTheDocument();
    expect(altPlanetsFetch).not.toHaveBeenCalled();
    expect((await db.settings.get(PI_COLONIES_SHOW_ALTS_KEY))?.value).toBe(true);
  });

  it('narrows own and alt colonies to Stopped and Expiring soon, with counts, and resets', async () => {
    const ALT_ID = 92;
    const EXPIRING_PLANET_ID = 40000002;
    const HEALTHY_PLANET_ID = 40000003;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    const altExtractor = (expiryMs: number) => ({
      links: [],
      routes: [],
      pins: [
        {
          pin_id: 9,
          type_id: 2848,
          latitude: 0,
          longitude: 0,
          expiry_time: new Date(expiryMs).toISOString(),
          extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
        },
      ],
    });
    await db.esiCache.bulkPut([
      {
        characterId: ALT_ID,
        key: 'planets',
        value: [EXPIRING_PLANET_ID, HEALTHY_PLANET_ID].map((planet_id) => ({
          ...planetsPayload[0],
          planet_id,
          owner_id: ALT_ID,
        })),
        fetchedAt: Date.now(),
      },
      {
        characterId: ALT_ID,
        key: `planet:${EXPIRING_PLANET_ID}`,
        value: altExtractor(Date.now() + 5 * 3_600_000),
        fetchedAt: Date.now(),
      },
      {
        characterId: ALT_ID,
        key: `planet:${HEALTHY_PLANET_ID}`,
        value: altExtractor(Date.now() + 5 * DAY_MS),
        fetchedAt: Date.now(),
      },
    ]);
    server.use(
      http.get(`${ESI}/characters/${ALT_ID}/planets`, () => HttpResponse.json([])),
      http.get(`${ESI}/universe/planets/:id`, ({ params }) =>
        HttpResponse.json({
          planet_id: Number(params.id),
          name: Number(params.id) === PLANET_ID ? 'Jita IV' : `Alt ${String(params.id)}`,
          system_id: SYSTEM_ID,
          type_id: 11,
          position: { x: 0, y: 0, z: 0 },
        })
      )
    );

    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup({ delay: null });
    const filters = () => screen.getByRole('group', { name: 'Filter colonies' });
    const chip = (name: RegExp) => within(filters()).getByRole('button', { name });
    const statuses = () =>
      [...coloniesPanel().querySelectorAll('[data-colony-status]')].map((row) =>
        row.getAttribute('data-colony-status')
      );

    expect(chip(/^Stopped 1 colony$/)).toBeEnabled();
    expect(chip(/^Expiring soon 0 colonies$/)).toBeDisabled();

    await user.click(chip(/show \d+ alt/i));
    expect(statuses()).toEqual(['stopped', 'expiring', 'healthy']);
    expect(chip(/^Expiring soon 1 colony$/)).toBeEnabled();

    await user.click(chip(/^Stopped/));
    expect(statuses()).toEqual(['stopped']);
    expect(within(coloniesPanel()).queryByText('Alt Two')).not.toBeInTheDocument();

    await user.click(chip(/^Expiring soon/));
    expect(statuses()).toEqual(['stopped', 'expiring']);

    await user.click(chip(/^Stopped/));
    expect(statuses()).toEqual(['expiring']);
    expect(within(coloniesPanel()).queryByText('Pilot One')).not.toBeInTheDocument();
    expect(within(coloniesPanel()).getByText('Alt Two')).toBeInTheDocument();

    await user.click(chip(/show \d+ alt/i));
    expect(statuses()).toEqual([]);
    expect(chip(/^Expiring soon 0 colonies$/)).toBeEnabled();
    expect(screen.getByText('No colonies in that state')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(statuses()).toEqual(['stopped']);
  });

  it('skips an alt without the planets scope: no ESI call, no re-auth banner', async () => {
    const SCOPELESS_ID = 93;
    const scopelessFetch = vi.fn();
    await addAlt(SCOPELESS_ID, 'Scopeless Alt', ['esi-skills.read_skills.v1']);
    server.use(
      http.get(`${ESI}/characters/${SCOPELESS_ID}/planets`, () => {
        scopelessFetch();
        return HttpResponse.json({ error: 'missing scope' }, { status: 403 });
      })
    );

    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    expect(scopelessFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Scopeless Alt/)).toHaveTextContent(/no planetary access/i);
    expect(screen.queryByText(/^Scopeless Alt: /)).not.toBeInTheDocument();
  });

  it('shows the page banner for a planets refusal another reader recorded', async () => {
    useAuthFailure.getState().reportRequestFailure(CHAR_ID, 'getCharacterPlanets');
    await renderIndustryRoutes();
    expect(await screen.findByText(/: log in again$/)).toBeInTheDocument();
    expect(screen.getAllByText(/: log in again$/)).toHaveLength(1);
  });

  it('keeps the colony view on the default tab, with no URL param needed', async () => {
    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    expect(screen.getByRole('tab', { name: 'Colonies' })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.search).toBe('');
  });

  it('opens the planner on the Plan tab and records it in the URL', async () => {
    const user = userEvent.setup({ delay: null });
    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);

    await user.click(screen.getByRole('tab', { name: 'Plan' }));

    await user.click(await screen.findByRole('button', { name: /Make a specific product/ }));
    await screen.findByRole('heading', { name: 'Goals' });
    expect(window.location.pathname).toBe('/planetary-industry/plan');
    expect(screen.queryByRole('heading', { name: /Jita IV/ })).not.toBeInTheDocument();
  });

  it('seeds a goal from the Industry "PI Plan" link and clears ?type=', async () => {
    window.history.pushState({}, '', `/planetary-industry/plan?type=${TRANSMITTER}`);
    await renderIndustryRoutes();

    expect(await screen.findByLabelText(`${TRANSMITTER_NAME} per day`)).toHaveValue('10');
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(window.location.search).toBe(`?goals=${TRANSMITTER}%3A10`));
  });

  it("keeps the browser's link menu on a goal's name and moves the item menu behind a visible ⋮", async () => {
    window.history.pushState({}, '', `/planetary-industry/plan?goals=${TRANSMITTER}:10`);
    await renderIndustryRoutes();
    await screen.findByLabelText(`${TRANSMITTER_NAME} per day`);
    const goals = screen.getByRole('list', { name: 'Goals' });
    const name = within(goals).getByRole('link', { name: TRANSMITTER_NAME });
    const onName = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    name.dispatchEvent(onName);
    expect(onName.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

    expect(
      within(goals).queryByRole('button', { name: `Remove ${TRANSMITTER_NAME}` })
    ).not.toBeInTheDocument();
    const user = userEvent.setup({ delay: null });
    await user.click(
      within(goals).getByRole('button', { name: `More actions for ${TRANSMITTER_NAME}` })
    );
    await user.click(await screen.findByRole('menuitem', { name: `Remove ${TRANSMITTER_NAME}` }));
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('drops a ?type= the planner cannot plan rather than seeding it', async () => {
    window.history.pushState({}, '', '/planetary-industry/plan?type=2268');
    await renderIndustryRoutes();

    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.queryByLabelText(/per day$/)).not.toBeInTheDocument();
  });

  it('opens the colony a ?colony= link names on the Colonies tab', async () => {
    window.history.pushState({}, '', `/planetary-industry/colonies?colony=${PLANET_ID}`);
    await renderIndustryRoutes();

    const row = (await screen.findByRole('heading', { name: /Jita IV/ })).closest(
      '[data-colony-status]'
    ) as HTMLElement;
    expect(within(row).getByRole('button', { name: /^Show details for / })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('flashes the colony a ?highlight= link names, then drops the param', async () => {
    window.history.pushState({}, '', `/planetary-industry/colonies?highlight=${PLANET_ID}`);
    await renderIndustryRoutes();

    const row = (await screen.findByRole('heading', { name: /Jita IV/ })).closest(
      '[data-colony-status]'
    ) as HTMLElement;
    expect(row).toHaveClass('row-pulse');
    expect(row).toHaveAttribute('data-row-key', String(PLANET_ID));
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it("plans the URL's goals over the colony: Lift first, then the change list", async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(plannableDetailPayload)
      )
    );
    window.history.pushState({}, '', `/planetary-industry/plan?goals=${WATER}:24`);
    await renderIndustryRoutes();

    const headline = await screen.findByTestId('goal-plan-headline');
    await waitFor(() => expect(headline).toHaveTextContent(/selling each colony.s best P1/));
    expect(within(headline).getByText(/^ISK\/day vs/)).toBeInTheDocument();
    expect(screen.getByLabelText(`${WATER_NAME} per day`)).toHaveValue('24');
    const changes = screen.getByRole('heading', { name: 'Changes' });
    expect(
      screen.getByRole('heading', { name: 'Plan' }).compareDocumentPosition(changes) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: 'Show colonies' }));
    expect(
      screen.getByLabelText(
        'Customs tax (POCO/Skyhook) for Jita IV (applies to all colonies in Jita)'
      )
    ).toHaveValue('6');
    const flow = screen.getByRole('table', { name: 'Everything the goals need, by tier' });
    expect(
      within(flow).getByRole('button', { name: `More actions for ${WATER_NAME}` })
    ).toBeInTheDocument();
  });

  it('lists a colony it cannot cost, left out with the reason', async () => {
    window.history.pushState({}, '', `/planetary-industry/plan?goals=${WATER}:24`);
    await renderIndustryRoutes();

    await userEvent
      .setup({ delay: null })
      .click(await screen.findByRole('button', { name: 'Show colonies' }));
    expect(
      await screen.findByText(/Left out: we couldn't measure the building links/)
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Jita IV/ })).toBeDisabled();
  });

  it('falls back to the Plan tab rather than crashing on a tab it does not know', async () => {
    window.history.pushState({}, '', '/planetary-industry/nonsense?type=not-a-number');
    await renderIndustryRoutes();
    await screen.findByRole('heading', { name: 'What do you want to do?' });
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on Plan, with the tabs in Plan, Map, Colonies order', async () => {
    window.history.pushState({}, '', '/planetary-industry');
    render(<App />);
    await screen.findByRole('heading', { name: 'What do you want to do?' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Plan',
      'Map',
      'Colonies',
    ]);
    expect(window.location.pathname).toBe('/planetary-industry/plan');
  });

  it('opens Plan on "Make more from my planets" when the pilot has colonies, and says why', async () => {
    window.history.pushState({}, '', '/planetary-industry/plan');
    await renderIndustryRoutes();
    const option = await screen.findByRole('button', { name: /Make more from my planets/ });
    expect(option).toHaveAttribute('aria-current', 'true');
    await userEvent
      .setup({ delay: null })
      .hover(screen.getByRole('button', { name: 'About this question' }));
    expect(
      (await screen.findAllByText(/Opened “Make more from my planets” because we found 1 colony/))
        .length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
  });

  it('opens Plan on "Find the best thing to build" when there are no colonies', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json([])));
    window.history.pushState({}, '', '/planetary-industry/plan');
    await renderIndustryRoutes();
    const option = await screen.findByRole('button', { name: /Find the best thing to build/ });
    expect(option).toHaveAttribute('aria-current', 'true');
    await userEvent
      .setup({ delay: null })
      .hover(screen.getByRole('button', { name: 'About this question' }));
    expect(
      (await screen.findAllByText(/You have no colonies yet, so we opened/)).length
    ).toBeGreaterThan(0);
  });

  it('restores the question from ?q= on load', async () => {
    window.history.pushState({}, '', '/planetary-industry/plan?q=find-best');
    await renderIndustryRoutes();
    const option = await screen.findByRole('button', { name: /Find the best thing to build/ });
    expect(option).toHaveAttribute('aria-current', 'true');
  });

  it('ignores a junk ?q= and opens on the default question', async () => {
    window.history.pushState({}, '', '/planetary-industry/plan?q=bogus');
    await renderIndustryRoutes();
    const option = await screen.findByRole('button', { name: /Make more from my planets/ });
    expect(option).toHaveAttribute('aria-current', 'true');
  });

  it('opens the Goal Planner on #customs, and a pick writes ?q= and drops the hash', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.pushState({}, '', '/planetary-industry/plan#customs');
    await renderIndustryRoutes();
    await screen.findByRole('heading', { name: 'Goals' });
    await user.click(screen.getByRole('button', { name: /Find the best thing to build/ }));
    expect(window.location.search).toBe('?q=find-best');
    expect(window.location.hash).toBe('');
    expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
  });

  it('writes the picked question to ?q= without adding history entries', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.pushState({}, '', '/planetary-industry/plan');
    const before = window.history.length;
    await renderIndustryRoutes();
    await user.click(await screen.findByRole('button', { name: /Find the best thing to build/ }));
    expect(window.location.search).toBe('?q=find-best');
    expect(window.history.length).toBe(before);
  });

  it('keeps the Goal Planner behind a ?goals= link, with no picker choice needed', async () => {
    window.history.pushState({}, '', `/planetary-industry/plan?goals=${WATER}:24`);
    await renderIndustryRoutes();
    await screen.findByRole('heading', { name: 'Goals' });
    await userEvent
      .setup({ delay: null })
      .hover(screen.getByRole('button', { name: 'About this question' }));
    expect(
      (
        await screen.findAllByText(
          'Opened “Make a specific product” because your link names a product.'
        )
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Make a specific product/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByLabelText(`${WATER_NAME} per day`)).toHaveValue('24');
  });

  it('opens the 60-second explainer from "New to PI?" on every tab', async () => {
    const user = userEvent.setup({ delay: null });
    window.history.pushState({}, '', '/planetary-industry/colonies');
    await renderIndustryRoutes();
    await user.click(await screen.findByRole('button', { name: 'New to PI?' }));
    expect(
      await screen.findByRole('dialog', { name: /New to PI\? The 60-second explainer/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Skyhook (nullsec only)')).toBeInTheDocument();
  });

  describe('with hub prices unavailable', () => {
    const NOTICE = 'Prices unavailable right now';
    const defaultPrices = vi.mocked(loadPlanPrices).getMockImplementation();
    beforeEach(() => {
      vi.mocked(loadPlanPrices).mockImplementation(async () => ({
        prices: {},
        buyPrices: {},
        unpriced: [],
        failed: true,
        fetchedAt: new Date(),
      }));
    });
    afterEach(() => {
      if (defaultPrices) vi.mocked(loadPlanPrices).mockImplementation(defaultPrices);
    });

    it('says so on Plan, with no zero figures', async () => {
      window.history.pushState({}, '', '/planetary-industry/plan');
      await renderIndustryRoutes();
      expect(await screen.findByText(NOTICE)).toBeInTheDocument();
      expect(screen.queryByText(/\+0 ISK/)).toBeNull();
      expect(screen.queryByText(/Haul 0/)).toBeNull();
      expect(screen.queryByText(/can't measure this colony/)).toBeNull();
    });

    it('says so on Map instead of drawing without it', async () => {
      window.history.pushState({}, '', '/planetary-industry/map');
      await renderIndustryRoutes();
      expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    });

    it('says so on Colonies, keeps the status rows, and shows no ISK/day', async () => {
      await renderIndustryRoutes();
      const panel = await colonyPanelFor(/Jita IV/);
      expect(await screen.findByText(NOTICE)).toBeInTheDocument();
      expect(panel).toHaveAttribute('data-colony-status', 'stopped');
      expect(screen.queryByText(/0\.00 ISK/)).toBeNull();
    });
  });

  describe('when ESI does not answer the planets read (issue #2691)', () => {
    const NOTICE = "ESI didn't answer";
    const down = () =>
      http.get(`${ESI}/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json({ error: 'unavailable' }, { status: 503 })
      );

    it.each([
      ['plan', '/planetary-industry/plan'],
      ['map', '/planetary-industry/map'],
      ['colonies', '/planetary-industry/colonies'],
    ])(
      'says so on %s, never "no colonies", and Retry re-reads',
      async (_tab, path) => {
        server.use(down());
        window.history.pushState({}, '', path);
        const user = userEvent.setup({ delay: null });
        await renderIndustryRoutes();
        expect(await screen.findByText(NOTICE, {}, { timeout: 15_000 })).toBeInTheDocument();
        expect(screen.queryByText('No colonies yet')).toBeNull();
        expect(screen.queryByText(/no colonies yet/i)).toBeNull();
        expect(
          screen.queryByText(/Couldn't load this character's planetary colonies yet/)
        ).toBeNull();
        if (_tab === 'map') {
          expect(await screen.findByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
        }

        server.resetHandlers();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.queryByText(NOTICE)).toBeNull(), { timeout: 15_000 });
      },
      30_000
    );

    it('keeps a warm cache on screen instead of the notice', async () => {
      await db.esiCache.put({
        characterId: CHAR_ID,
        key: 'planets',
        value: planetsPayload,
        fetchedAt: 1234,
      });
      server.use(down());
      await renderIndustryRoutes();
      await colonyPanelFor(/Jita IV/);
      expect(screen.queryByText(NOTICE)).toBeNull();
    });

    it('still says "no colonies" for an answer that really is empty', async () => {
      server.use(http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json([])));
      await renderIndustryRoutes();
      expect(await screen.findByText('No colonies yet')).toBeInTheDocument();
      expect(screen.queryByText(NOTICE)).toBeNull();
    });
  });

  it('draws the planet map on the Map tab', async () => {
    window.history.pushState({}, '', '/planetary-industry/map');
    await renderIndustryRoutes();
    expect(await screen.findByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('The PI map is coming')).toBeNull();
  });

  describe("a product's PI detail is a URL (?product=)", () => {
    const BIOFUELS = 2396;
    const drawer = () => screen.findByRole('dialog', { name: /^(How to make|Where to get) / });

    it('opens the Map with that product drawer open, and a reload reopens it', async () => {
      window.history.pushState({}, '', `/planetary-industry/map?product=${BIOFUELS}`);
      const first = await renderIndustryRoutes();
      expect(within(await drawer()).getByText('Biofuels', { selector: 'div' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
      first.unmount();
      await renderIndustryRoutes();
      expect(within(await drawer()).getByText('Biofuels', { selector: 'div' })).toBeInTheDocument();
    });

    it('carries View in Market and Show info, the destinations the name link displaced', async () => {
      window.history.pushState({}, '', `/planetary-industry/map?product=${BIOFUELS}`);
      await renderIndustryRoutes();
      const dialog = await drawer();
      expect(within(dialog).getByRole('link', { name: 'View in Market' })).toHaveAttribute(
        'href',
        expect.stringContaining('/market/browser')
      );
      expect(within(dialog).getByRole('button', { name: 'Show info' })).toBeInTheDocument();
    });

    it('closes on Back: a tile click pushes the entry, Back pops it', async () => {
      const user = userEvent.setup({ delay: null });
      window.history.pushState({}, '', '/planetary-industry/map');
      await renderIndustryRoutes();
      const board = await screen.findByRole('group', { name: /^Planet map/ });
      const tile = within(board).getByRole('link', { name: /^Biofuels\. / });
      expect(tile).toHaveAttribute('href', `/planetary-industry/map?product=${BIOFUELS}`);
      await user.click(tile);
      await drawer();
      expect(window.location.search).toBe(`?product=${BIOFUELS}`);
      window.history.back();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(window.location.pathname).toBe('/planetary-industry/map');
      expect(window.location.search).toBe('');
    });

    it.each(['999999999', 'abc', '-1'])('ignores a junk product id (%s)', async (junk) => {
      window.history.pushState({}, '', `/planetary-industry/map?product=${junk}`);
      await renderIndustryRoutes();
      expect(await screen.findByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
      await waitFor(() => expect(window.location.search).not.toContain('product'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it("keeps Plan's ?q= beside ?product=: a name on Plan opens the drawer, Back returns to the question", async () => {
      const user = userEvent.setup({ delay: null });
      window.history.pushState({}, '', '/planetary-industry/plan?q=find-best');
      await renderIndustryRoutes();
      const link = await waitFor(() => {
        const found = document.querySelector<HTMLAnchorElement>('a[href*="product="]');
        expect(found).not.toBeNull();
        return found!;
      });
      expect(link.getAttribute('href')).toMatch(
        /^\/planetary-industry\/map\?q=find-best&product=\d+$/
      );
      await user.click(link);
      await drawer();
      expect(window.location.search).toMatch(/^\?q=find-best&product=\d+$/);
      window.history.back();
      await waitFor(() => expect(window.location.pathname).toBe('/planetary-industry/plan'));
      expect(window.location.search).toBe('?q=find-best');
    });

    it('ignores a junk product id beside ?q=, keeping ?q=', async () => {
      window.history.pushState({}, '', '/planetary-industry/map?q=find-best&product=abc');
      await renderIndustryRoutes();
      expect(await screen.findByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
      await waitFor(() => expect(window.location.search).toBe('?q=find-best'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('drops ?product= when a tab switch leaves the Map', async () => {
      const user = userEvent.setup({ delay: null });
      window.history.pushState({}, '', `/planetary-industry/map?product=${BIOFUELS}`);
      await renderIndustryRoutes();
      await drawer();
      await user.click(screen.getByRole('tab', { name: 'Colonies' }));
      await waitFor(() => expect(window.location.pathname).toBe('/planetary-industry/colonies'));
      await waitFor(() => expect(window.location.search).not.toContain('product'));
    });

    it('drops ?planet= when a tab switch leaves the Map', async () => {
      const user = userEvent.setup({ delay: null });
      window.history.pushState({}, '', `/planetary-industry/map?planet=${PLANET_ID}`);
      await renderIndustryRoutes();
      expect(await screen.findByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Plan' }));
      await waitFor(() => expect(window.location.pathname).toBe('/planetary-industry/plan'));
      await waitFor(() => expect(window.location.search).not.toContain('planet'));
    });
  });

  it('redirects the retired Advisor URL to Colonies, with no Advisor left on the page', async () => {
    window.history.pushState({}, '', '/planetary-industry/advisor');
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    expect(window.location.pathname).toBe('/planetary-industry/colonies');
    expect(screen.queryByRole('heading', { name: 'Advisor' })).toBeNull();
    expect(screen.queryByText('Advisor')).toBeNull();
  });

  it('puts the shared header strip, with the Sell at picker, under the tabs on every tab', async () => {
    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const strip = screen.getByTestId('pi-header-strip');
    expect(
      within(strip).getByRole('button', { name: /, Where do you sell\?$/ })
    ).toBeInTheDocument();
    await userEvent.click(within(strip).getByRole('button', { name: 'Home, colonies and route' }));
    expect(
      within(await screen.findByTestId('pi-strip-facts')).getByText('Colonies')
    ).toBeInTheDocument();
  });

  it('lets the Sell at picker grow past its minimum, so a hub with its percent is not cut off', async () => {
    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const picker = within(screen.getByTestId('pi-header-strip')).getByRole('button', {
      name: /, Where do you sell\?$/,
    });
    expect(picker).toHaveClass('min-w-40', 'w-auto');
    expect(picker).not.toHaveClass('w-40');
  });

  it('reads an alt with nothing cached as "not loaded yet", never as having no colonies', async () => {
    await addAlt(92, 'Unread Alt', [PLANETS_SCOPE]);
    await addAlt(93, 'Empty Alt', [PLANETS_SCOPE]);
    await db.esiCache.put({ characterId: 93, key: 'planets', value: [], fetchedAt: Date.now() });

    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    const unread = screen.getByText(/^Unread Alt:/);
    const empty = screen.getByText(/Empty Alt/);
    expect(unread).not.toBe(empty);
    expect(unread).toHaveTextContent(/not loaded yet/i);
    expect(empty).toHaveTextContent(/No colonies/i);
  });

  it('switches to an alt straight from the not-loaded list, staying on the page', async () => {
    await addAlt(92, 'Unread Alt', [PLANETS_SCOPE]);
    await addAlt(94, 'Other Unread', [PLANETS_SCOPE]);

    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    expect(screen.getByRole('button', { name: 'Switch to Other Unread' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch to Unread Alt' }));

    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(92));
    expect(window.location.pathname).toContain('/planetary-industry');
  });

  it('switches to an alt from its colony group header, making its colonies the primary section', async () => {
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });

    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));
    await user.click(screen.getByRole('button', { name: 'Switch to Alt Two' }));

    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(ALT_ID));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Switch to Alt Two' })).not.toBeInTheDocument()
    );
    expect(window.location.pathname).toContain('/planetary-industry');
  });

  it("summarizes an alt colony group's header with its own stopped count and next expiry", async () => {
    const ALT_ID = 92;
    const STOPPED_PLANET_ID = 40000002;
    const ACTIVE_PLANET_ID = 40000003;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [
        { ...planetsPayload[0], planet_id: STOPPED_PLANET_ID, owner_id: ALT_ID },
        { ...planetsPayload[0], planet_id: ACTIVE_PLANET_ID, owner_id: ALT_ID },
      ],
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${STOPPED_PLANET_ID}`,
      value: detailPayload,
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ACTIVE_PLANET_ID}`,
      value: {
        links: [],
        routes: [],
        pins: [
          {
            pin_id: 21,
            type_id: 2848,
            latitude: 0,
            longitude: 0,
            expiry_time: new Date(BASE_NOW + 50 * 60_000).toISOString(),
            extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
          },
        ],
      },
      fetchedAt: Date.now(),
    });

    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    expect(within(coloniesPanel()).getByText(/^1 stopped · next \d+m$/)).toBeInTheDocument();
  });

  it("badges an alt colony group's header with that alt's own cache age, not the active Character's", async () => {
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    const threeDaysAgo = Date.now() - 3 * DAY_MS;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: threeDaysAgo,
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: detailPayload,
      fetchedAt: Date.now() - DAY_MS / 24,
    });

    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    const altHeader = screen
      .getByRole('button', { name: 'Switch to Alt Two' })
      .closest('[data-character-group-header]');
    if (!(altHeader instanceof HTMLElement)) throw new Error('no alt group header');
    const badge = altHeader.querySelector('time');
    expect(badge).toHaveAttribute('dateTime', new Date(threeDaysAgo).toISOString());

    const activeHeader = within(coloniesPanel())
      .getByText('Pilot One')
      .closest('[data-character-group-header]');
    if (!(activeHeader instanceof HTMLElement)) throw new Error('no active group header');
    expect(activeHeader.querySelector('time')).toBeNull();
  });

  it("resolves an alt colony's unresolved planet and product names via a public lookup, not raw ids", async () => {
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    const ALT_PRODUCT_ID = 77_777;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    server.use(
      http.get(`${ESI}/universe/planets/${ALT_PLANET_ID}`, () =>
        HttpResponse.json({
          planet_id: ALT_PLANET_ID,
          name: 'Amarr III',
          system_id: SYSTEM_ID,
          type_id: 11,
          position: { x: 0, y: 0, z: 0 },
        })
      ),
      http.post(`${ESI}/universe/names`, async ({ request }) => {
        const ids = (await request.json()) as number[];
        const withAltProduct: typeof NAMES = {
          ...NAMES,
          [ALT_PRODUCT_ID]: { name: 'Some Product', category: 'inventory_type' },
        };
        return HttpResponse.json(
          ids.filter((id) => withAltProduct[id]).map((id) => ({ id, ...withAltProduct[id] }))
        );
      })
    );
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: {
        links: [],
        routes: [],
        pins: [
          {
            pin_id: 30,
            type_id: 2848,
            latitude: 0,
            longitude: 0,
            expiry_time: new Date(BASE_NOW + 5 * DAY_MS).toISOString(),
            extractor_details: {
              heads: [{ head_id: 1, latitude: 0, longitude: 0 }],
              product_type_id: ALT_PRODUCT_ID,
            },
          },
        ],
      },
      fetchedAt: Date.now(),
    });

    await renderIndustryRoutes();
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /show \d+ alt/i }));

    const panel = coloniesPanel();
    expect(await within(panel).findByText('Amarr III')).toBeInTheDocument();
    expect(
      within(panel).queryByText(new RegExp(`Planet #${ALT_PLANET_ID}`))
    ).not.toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Show details for Amarr III' }));
    expect((await within(panel).findAllByText('Some Product')).length).toBeGreaterThan(0);
  });
});
