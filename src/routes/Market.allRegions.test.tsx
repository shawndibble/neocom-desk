/**
 * Market Browser's All regions choice: the selected item's book fanned out
 * over every Market Region (or only those in Jump Range), merged into one.
 * Its own file so the Current System / stargate mocks below don't leak into
 * the main Market suite.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { useMarketHub } from '@/features/market/hub';
import { useLocationMode, DEFAULT_LOCATION_MODE } from '@/features/market/locationMode';
import { clearOrderBookCache } from '@/features/market/orderBook';
import { usePickedSystems } from '@/features/route/currentSystem';
import type { LocalJumpDistances } from '@/features/route/localRoute';
import { resetEsiBudget } from '@/esi/budget';
import { ESI_BASE_URL } from '@/esi/client';
import { App } from '@/app/App';
import type {
  MarketGroupNode,
  MarketTypeEntry,
  MarketRegionEntry,
  NpcStationEntry,
  SolarSystemEntry,
} from '@/sde/marketTypes';

const THE_FORGE = 10000002;
const DOMAIN = 10000043;
const HEIMATAR = 10000030;
const JITA = 30000142;
const AMARR = 30002187;
const RENS = 30002510;
const JITA_4_4 = 60003760;
const AMARR_8 = 60008494;
const RIFTER = 587;

vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: vi.fn(async () => ({})),
  loadTypes: vi.fn(async () => ({})),
  loadSkills: vi.fn(async () => []),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const GROUPS: MarketGroupNode[] = [{ id: 2, name: 'Frigates', parentId: null, hasTypes: true }];
const TYPES: MarketTypeEntry[] = [{ typeId: RIFTER, name: 'Rifter', marketGroupId: 2 }];
const STATIONS: NpcStationEntry[] = [
  { id: JITA_4_4, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: JITA },
  { id: AMARR_8, name: 'Amarr VIII (Oris) - Emperor Family Academy', systemId: AMARR },
];
const SYSTEMS: SolarSystemEntry[] = [
  { id: JITA, name: 'Jita', security: 0.9459, regionId: THE_FORGE },
  { id: AMARR, name: 'Amarr', security: 1.0, regionId: DOMAIN },
  { id: RENS, name: 'Rens', security: 0.9, regionId: HEIMATAR },
];
const REGIONS: MarketRegionEntry[] = [
  { id: THE_FORGE, name: 'The Forge' },
  { id: DOMAIN, name: 'Domain' },
  { id: HEIMATAR, name: 'Heimatar' },
];

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: vi.fn(async () => GROUPS),
  loadMarketTypes: vi.fn(async () => TYPES),
  loadNpcStations: vi.fn(async () => STATIONS),
  loadSolarSystems: vi.fn(async () => SYSTEMS),
  loadMarketRegions: vi.fn(async () => REGIONS),
  loadGlobalMarkets: vi.fn(async () => []),
  loadVariations: vi.fn(async () => ({ types: {}, metaGroups: {} })),
  loadAttributeDictionary: vi.fn(async () => ({})),
}));

// The Jump Range's origin and distances. No game location unless a test says
// otherwise, so a range reads "set your system" and restricts nothing.
const loadCharacterSolarSystemId = vi.fn<(characterId: number) => Promise<number | null>>();
vi.mock('@/features/character/location', () => ({
  loadCharacterSolarSystemId: (characterId: number) => loadCharacterSolarSystemId(characterId),
}));
const localJumpDistances = vi.fn<(originSystemId: number) => Promise<LocalJumpDistances>>();
vi.mock('@/features/route/localRoute', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/route/localRoute')>();
  return {
    ...actual,
    localJumpDistances: (originSystemId: number) => localJumpDistances(originSystemId),
  };
});

function sellOrder(orderId: number, price: number, locationId: number, systemId: number) {
  return {
    order_id: orderId,
    type_id: RIFTER,
    is_buy_order: false,
    price,
    location_id: locationId,
    system_id: systemId,
    volume_remain: 1,
    volume_total: 1,
    min_volume: 1,
    duration: 90,
    issued: '2026-08-01T00:00:00Z',
    range: 'region',
  };
}

const ORDERS_BY_REGION: Record<number, unknown[]> = {
  [THE_FORGE]: [sellOrder(1, 1_000_000, JITA_4_4, JITA)],
  [DOMAIN]: [sellOrder(2, 1_100_000, AMARR_8, AMARR)],
  [HEIMATAR]: [sellOrder(3, 1_200_000, 1035466617946, RENS)],
};

/** Every region's book, by path pattern; `failing` regions answer 404. */
function regionOrdersHandler(hits: Map<number, number>, failing: readonly number[] = []) {
  return http.get(`${ESI_BASE_URL}/markets/:regionId/orders`, ({ params }) => {
    const regionId = Number(params.regionId);
    hits.set(regionId, (hits.get(regionId) ?? 0) + 1);
    if (failing.includes(regionId)) {
      return HttpResponse.json({ error: 'not found' }, { status: 404 });
    }
    return HttpResponse.json(ORDERS_BY_REGION[regionId] ?? [], { headers: { 'X-Pages': '1' } });
  });
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  await db.quickbars.clear();
  await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  useLocationMode.setState({ value: DEFAULT_LOCATION_MODE, hydrated: false });
  usePickedSystems.setState({ value: {}, hydrated: false });
  loadCharacterSolarSystemId.mockReset();
  loadCharacterSolarSystemId.mockResolvedValue(null);
  localJumpDistances.mockReset();
  localJumpDistances.mockResolvedValue({ kind: 'unknown' });
  clearOrderBookCache();
  resetEsiBudget();
  window.history.pushState({}, '', '/market');
});

describe('Market Browser: All regions', () => {
  it('offers All regions in the region picker and switches the book to it', async () => {
    const hits = new Map<number, number>();
    server.use(regionOrdersHandler(hits));
    const user = userEvent.setup();
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=${THE_FORGE}`);
    render(<App />);

    await screen.findByRole('table', { name: 'Sell Orders' });
    await user.click(screen.getByRole('combobox', { name: 'Region' }));
    await user.click(await screen.findByRole('option', { name: 'All regions' }));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,100,000.00')).toBeInTheDocument();
    expect(window.location.search).toContain('region=all');
    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveTextContent('All regions');
  });

  it('merges every region into one book, and names the hub region the other readers use', async () => {
    const hits = new Map<number, number>();
    server.use(regionOrdersHandler(hits));
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=all`);
    render(<App />);

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,000,000.00')).toBeInTheDocument();
    expect(within(sellTable).getByText('1,100,000.00')).toBeInTheDocument();
    expect(within(sellTable).getByText('1,200,000.00')).toBeInTheDocument();
    expect(screen.getByText(/use The Forge/)).toBeInTheDocument();
    expect(hits.get(THE_FORGE)).toBe(1);
    expect(hits.get(DOMAIN)).toBe(1);
    expect(hits.get(HEIMATAR)).toBe(1);
  });

  it('shows the regions that loaded, with a note for the one that failed', async () => {
    const hits = new Map<number, number>();
    server.use(regionOrdersHandler(hits, [DOMAIN]));
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=all`);
    render(<App />);

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,000,000.00')).toBeInTheDocument();
    expect(within(sellTable).queryByText('1,100,000.00')).not.toBeInTheDocument();
    expect(
      screen.getByText("1 region didn't load, so its orders are missing. Refresh to retry.")
    ).toBeInTheDocument();
  });

  it('is a failed book, not an empty one, when every region failed', async () => {
    server.use(regionOrdersHandler(new Map(), [THE_FORGE, DOMAIN, HEIMATAR]));
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=all`);
    render(<App />);

    expect(await screen.findByText("Couldn't load the order book")).toBeInTheDocument();
  });

  it('with a Jump Range set, fetches only the regions holding an in-range system', async () => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1 });
    loadCharacterSolarSystemId.mockResolvedValue(JITA);
    localJumpDistances.mockResolvedValue({
      kind: 'known',
      jumps: new Map([
        [JITA, 0],
        [AMARR, 4],
        [RENS, 12],
      ]),
    });
    const hits = new Map<number, number>();
    server.use(regionOrdersHandler(hits));
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=all&browser.jumps=5`);
    render(<App />);

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,100,000.00')).toBeInTheDocument();
    expect(within(sellTable).getByText('1,000,000.00')).toBeInTheDocument();
    // Never fired while the range was still resolving, and never since.
    expect(hits.get(HEIMATAR)).toBeUndefined();
    expect(hits.get(THE_FORGE)).toBe(1);
    expect(hits.get(DOMAIN)).toBe(1);
    // The "only this region is checked" hint would be false in All regions.
    expect(screen.queryByText('Only orders in this region are checked.')).not.toBeInTheDocument();
  });
});
