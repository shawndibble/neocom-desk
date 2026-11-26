import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { useDefaultMarketHub, useMarketHub } from '@/features/market/hub';
import { usePageHubs } from '@/features/market/pageHubs';
import { useLocationMode, DEFAULT_LOCATION_MODE } from '@/features/market/locationMode';
import {
  useBrowserFilterSetting,
  DEFAULT_BROWSER_FILTER_SETTING,
  BROWSER_FILTER_SETTING_KEY,
} from '@/features/market/browserFilterSetting';
import { clearOrderBookCache } from '@/features/market/orderBook';
import { usePickedSystems } from '@/features/route/currentSystem';
import type { LocalJumpDistances } from '@/features/route/localRoute';
import { resetEsiBudget } from '@/esi/budget';
import { ESI_BASE_URL } from '@/esi/client';
import { marketTypesHandler, renderMarketRoute } from '@/test/marketPage';
import * as routeChunks from '@/app/routeChunks';
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
const TYPES: MarketTypeEntry[] = [{ typeId: RIFTER, name: 'Rifter', marketGroupId: 2, volume: 1 }];
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

const server = setupServer(marketTypesHandler([RIFTER]));

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  await routeChunks.loadMarket();
  await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
  loadCharacterSolarSystemId.mockResolvedValue(null);
  localJumpDistances.mockResolvedValue({ kind: 'unknown' });
  window.history.pushState({}, '', '/market');
  const { unmount } = renderMarketRoute();
  await screen.findByRole('searchbox', {}, { timeout: 25_000 });
  unmount();
}, 30_000);
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  await db.quickbars.clear();
  await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useDefaultMarketHub.setState({ value: 'jita', hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  usePageHubs.setState({ value: {}, hydrated: false });
  useLocationMode.setState({ value: DEFAULT_LOCATION_MODE, hydrated: false });
  useBrowserFilterSetting.setState({ value: DEFAULT_BROWSER_FILTER_SETTING, hydrated: false });
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
    const user = userEvent.setup({ delay: null });
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=${THE_FORGE}`);
    renderMarketRoute();

    await screen.findByRole('table', { name: 'Sell Orders' });
    await user.click(screen.getByRole('combobox', { name: 'Region' }));
    await user.click(await screen.findByRole('option', { name: 'All regions' }));

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,100,000')).toBeInTheDocument();
    expect(window.location.search).toContain('region=all');
    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveTextContent('All regions');
  });

  it('merges every region into one book, and names the hub region the other readers use', async () => {
    const hits = new Map<number, number>();
    server.use(regionOrdersHandler(hits));
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=all`);
    renderMarketRoute();

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,000,000')).toBeInTheDocument();
    expect(within(sellTable).getByText('1,100,000')).toBeInTheDocument();
    expect(within(sellTable).getByText('1,200,000')).toBeInTheDocument();
    await userEvent
      .setup({ delay: null })
      .hover(screen.getByRole('button', { name: 'What else this covers' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/use The Forge/);
    expect(hits.get(THE_FORGE)).toBe(1);
    expect(hits.get(DOMAIN)).toBe(1);
    expect(hits.get(HEIMATAR)).toBe(1);
  });

  it('shows the regions that loaded, with a note for the one that failed', async () => {
    const hits = new Map<number, number>();
    server.use(regionOrdersHandler(hits, [DOMAIN]));
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=all`);
    renderMarketRoute();

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,000,000')).toBeInTheDocument();
    expect(within(sellTable).queryByText('1,100,000')).not.toBeInTheDocument();
    expect(
      screen.getAllByText("1 region didn't load, so its orders are missing. Refresh to retry.")
    ).toHaveLength(2);
  });

  it('is a failed book, not an empty one, when every region failed', async () => {
    server.use(regionOrdersHandler(new Map(), [THE_FORGE, DOMAIN, HEIMATAR]));
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=all`);
    renderMarketRoute();

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
    renderMarketRoute();

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,100,000')).toBeInTheDocument();
    expect(within(sellTable).getByText('1,000,000')).toBeInTheDocument();
    const sellRows = within(sellTable).getAllByRole('row');
    const jumpsCell = (row: HTMLElement) => row.querySelector('[data-label="Jumps"]');
    expect(within(jumpsCell(sellRows[1]) as HTMLElement).getByText('0')).toBeInTheDocument();
    expect(within(jumpsCell(sellRows[2]) as HTMLElement).getByText('4')).toBeInTheDocument();
    expect(hits.get(HEIMATAR)).toBeUndefined();
    expect(hits.get(THE_FORGE)).toBe(1);
    expect(hits.get(DOMAIN)).toBe(1);
    expect(screen.queryByText('Only orders in this region are checked.')).not.toBeInTheDocument();
  });

  it('in Trade Hub mode, a Jump Range reaches past the hub into every region in range', async () => {
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
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&browser.jumps=5`);
    renderMarketRoute();

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,100,000')).toBeInTheDocument();
    expect(within(sellTable).getByText('1,000,000')).toBeInTheDocument();
    expect(within(sellTable).queryByText('1,200,000')).not.toBeInTheDocument();
    expect(within(sellTable).getByText(/Emperor Family Academy/)).toBeInTheDocument();
    expect(hits.get(HEIMATAR)).toBeUndefined();
    expect(hits.get(THE_FORGE)).toBe(1);
    expect(hits.get(DOMAIN)).toBe(1);
    await userEvent
      .setup({ delay: null })
      .hover(screen.getByRole('button', { name: 'What else this covers' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /use Jita\. Only the order book reaches/
    );
  });

  it('offers the Distance filter before any item is picked, named after the header scope', async () => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1 });
    loadCharacterSolarSystemId.mockResolvedValue(JITA);
    const user = userEvent.setup({ delay: null });
    window.history.pushState({}, '', '/market/browser');
    renderMarketRoute();

    const distance = await screen.findByRole('combobox', { name: 'Distance' });
    expect(distance).toHaveTextContent('Jita');
    expect(screen.queryByRole('button', { name: /Change current system/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Security/ })).not.toBeInTheDocument();

    await user.click(distance);
    await user.click(await screen.findByRole('option', { name: 'Within 5 jumps' }));

    expect(screen.getByRole('button', { name: /Change current system/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('button', { name: /^Security/ })).toBeInTheDocument();
  });

  it('with a persisted Jump Range and no matching query param, fetches only the in-range regions from the first request', async () => {
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1 });
    await db.settings.put({
      key: BROWSER_FILTER_SETTING_KEY,
      value: { ...DEFAULT_BROWSER_FILTER_SETTING, jumps: '5' },
    });
    const realGet = db.settings.get.bind(db.settings);
    vi.spyOn(db.settings, 'get').mockImplementation((async (key: string) => {
      if (key === BROWSER_FILTER_SETTING_KEY) await new Promise((r) => setTimeout(r, 50));
      return realGet(key);
    }) as typeof db.settings.get);
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
    window.history.pushState({}, '', `/market/browser?type=${RIFTER}&region=all`);
    renderMarketRoute();

    const sellTable = await screen.findByRole('table', { name: 'Sell Orders' });
    expect(await within(sellTable).findByText('1,100,000')).toBeInTheDocument();
    expect(within(sellTable).getByText('1,000,000')).toBeInTheDocument();
    expect(hits.get(HEIMATAR)).toBeUndefined();
    expect(hits.get(THE_FORGE)).toBe(1);
    expect(hits.get(DOMAIN)).toBe(1);
  });
});
