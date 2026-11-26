import { useBelowMarketSide } from '@/features/contractSearch/belowMarketData';
import { useState } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import {
  useCourierFilterPref,
  DEFAULT_COURIER_FILTER,
} from '@/features/contractSearch/courierFilterPref';
import { clearJumpGraphIndex } from '@/sde/jumpGraph';
import { loadMarketTypes, loadSolarSystemJumps } from '@/sde/loadMarketSde';
import { clearMarketTypeIndex } from '@/sde/marketTypesById';
import {
  ContractSearchPanel,
  type ContractMode,
  type ContractSearchStatus,
} from '@/features/contractSearch/ContractSearchPanel';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { R2SnapshotRead } from '@/features/contractSearch/r2Snapshot';
import type { CachedResult } from '@/esi/cache';
import type { MarketTypeEntry, NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';
import { clearNpcStationIndex } from '@/sde/npcStations';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';
import { LocationProbe } from '@/test/LocationProbe';
import { deferred } from '@/test/deferred';

const loadPublicContractOffers = vi.fn();
vi.mock('@/features/contractSearch/publicContractOffers', () => ({
  loadPublicContractOffers: (...args: unknown[]) => loadPublicContractOffers(...args),
}));

const loadOfferIndex = vi.fn();
const loadOffersForTypes = vi.fn();
vi.mock('@/features/contractSearch/publicContractOfferIndex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/contractSearch/publicContractOfferIndex')>()),
  loadOfferIndex: (...args: unknown[]) => loadOfferIndex(...args),
  loadOffersForTypes: (...args: unknown[]) => loadOffersForTypes(...args),
}));

const usePlexPrice = vi.fn<() => number | null>(() => null);
vi.mock('@/features/market/plexPrice', () => ({
  usePlexPrice: () => usePlexPrice(),
}));

const NO_HUB_PRICES = { prices: new Map(), unreachable: false };
const getHubPricesWithStatus = vi.fn<(...args: unknown[]) => Promise<typeof NO_HUB_PRICES>>(
  async () => NO_HUB_PRICES
);
const getRegionSellPrices = vi.fn<(...args: unknown[]) => Promise<Map<number, number | null>>>(
  async () => new Map()
);
vi.mock('@/market/prices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/market/prices')>()),
  getHubPricesWithStatus: (...args: unknown[]) => getHubPricesWithStatus(...args),
  getRegionSellPrices: (...args: unknown[]) => getRegionSellPrices(...args),
}));
vi.mock('@/features/abyssal/mutaplasmidData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/abyssal/mutaplasmidData')>()),
  loadMutaplasmidLookup: async () => ({ isAbyssalType: () => false }),
}));
vi.mock('@/features/pi/salesTaxRate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/pi/salesTaxRate')>()),
  loadAccountingLevel: async () => 0,
}));

const loadPublicCourierContracts = vi.fn();
vi.mock('@/features/contractSearch/publicCourierContracts', () => ({
  loadPublicCourierContracts: (...args: unknown[]) => loadPublicCourierContracts(...args),
}));

const loadRegionName = vi.fn<(regionId: number) => Promise<string>>(async (regionId) =>
  regionId === 10000002 ? 'The Forge' : 'Domain'
);
vi.mock('@/features/bpcContracts/regionNames', () => ({
  loadRegionName: (...args: [number]) => loadRegionName(...args),
}));

const loadContractLocationName =
  vi.fn<(characterId: number, locationId: number) => Promise<string | null>>();
vi.mock('@/features/character/contractLocationName', () => ({
  loadContractLocationName: (characterId: number, locationId: number) =>
    loadContractLocationName(characterId, locationId),
}));

const loadPublicContractItems = vi.fn();
vi.mock('@/features/bpcContracts/publicContractItems', () => ({
  loadPublicContractItems: (...args: unknown[]) => loadPublicContractItems(...args),
}));

vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(
    async () =>
      new Map([
        [34, 'Tritanium'],
        [48098, 'Baryon Exotic Plasma S Blueprint'],
      ])
  ),
}));

const loadCharacterSolarSystemId = vi.fn<(characterId: number) => Promise<number | null>>();
vi.mock('@/features/character/location', () => ({
  loadCharacterSolarSystemId: (characterId: number) => loadCharacterSolarSystemId(characterId),
}));

vi.mock('@/sde/loadSde', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/sde/loadSde')>();
  return {
    ...actual,
    loadBlueprints: vi.fn(async () => ({
      '638': {
        name: 'Rifter Blueprint',
        time: 1200,
        materials: [],
        products: [{ typeID: 587, quantity: 1 }],
      },
    })),
  };
});

const CATALOG: MarketTypeEntry[] = [
  { typeId: 34, name: 'Tritanium', marketGroupId: 18, volume: 1 },
  { typeId: 35, name: 'Pyerite', marketGroupId: 18, volume: 1 },
  { typeId: 587, name: 'Rifter', marketGroupId: 61, volume: 1 },
];
const JITA = 60003760;
const AMARR = 60008494;
const JITA_SYSTEM = 30000142;
const UNKNOWN_STRUCTURE = 1035466617946;
const LOWSEC_SHORTCUT = 30000200;

const RANCER = 60011740;
const RANCER_SYSTEM = 30002809;
const NULL_STATION = 60014437;
const NULL_SYSTEM = 30001161;
const UEDAMA_STATION = 60011866;
const UEDAMA_SYSTEM = 30002768;

const STATIONS: NpcStationEntry[] = [
  { id: JITA, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 },
  { id: AMARR, name: 'Amarr VIII (Oris) - Emperor Family Academy', systemId: 30002187 },
  { id: RANCER, name: 'Rancer III - Moon 1', systemId: RANCER_SYSTEM },
  { id: NULL_STATION, name: 'Outpost', systemId: NULL_SYSTEM },
  { id: UEDAMA_STATION, name: 'Uedama V - Moon 3', systemId: UEDAMA_SYSTEM },
];
const SYSTEMS: SolarSystemEntry[] = [
  { id: 30000142, name: 'Jita', security: 0.9, regionId: 10000002 },
  { id: 30002187, name: 'Amarr', security: 1, regionId: 10000043 },
  { id: 30000144, name: 'Perimeter', security: 0.9, regionId: 10000002 },
  { id: 30000146, name: 'Urlen', security: 0.9, regionId: 10000002 },
  { id: 30002186, name: 'Niarja', security: 0.5, regionId: 10000043 },
  { id: LOWSEC_SHORTCUT, name: 'Ohide', security: 0.3, regionId: 10000043 },
  { id: RANCER_SYSTEM, name: 'Rancer', security: 0.4, regionId: 10000043 },
  { id: NULL_SYSTEM, name: 'Vale', security: 0.0, regionId: 10000043 },
  { id: UEDAMA_SYSTEM, name: 'Uedama', security: 0.50544, regionId: 10000033 },
];

const JUMPS = {
  30000142: [30000144, LOWSEC_SHORTCUT],
  30000144: [30000142, 30000146],
  30000146: [30000144, 30002186],
  30002186: [30000146, 30002187],
  30002187: [30002186, LOWSEC_SHORTCUT],
  [LOWSEC_SHORTCUT]: [30000142, 30002187],
};

const REGIONS = [
  { id: 10000002, name: 'The Forge' },
  { id: 10000043, name: 'Domain' },
];

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketTypes: vi.fn(async () => CATALOG),
  loadMarketRegions: vi.fn(async () => REGIONS),
  loadNpcStations: vi.fn(async () => STATIONS),
  loadSolarSystems: vi.fn(async () => SYSTEMS),
  loadSolarSystemJumps: vi.fn(async () => JUMPS),
}));

const COLLATERAL_CELL = 2;
const JUMPS_CELL = 3;
const ISK_PER_JUMP_CELL = 4;
const ISK_PER_VOLUME_CELL = 5;

const CHAR_ID = 91;

function row(overrides: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 34,
    price: 1_000_000,
    isAuction: false,
    quantity: 100,
    dateExpired: Date.parse('2099-09-10T00:00:00Z'),
    ...overrides,
  };
}

const TRIT_FORGE = row({ contractId: 1, typeId: 34, price: 1_000_000 });
const TRIT_DOMAIN = row({ contractId: 2, typeId: 34, price: 500_000, regionId: 10000043 });
const PYERITE_AUCTION = row({
  contractId: 3,
  typeId: 35,
  price: 1,
  buyout: 2_000_000,
  isAuction: true,
  quantity: 10,
});

function courierRow(overrides: Partial<PublicCourierContractRow> = {}): PublicCourierContractRow {
  return {
    contractId: 500,
    regionId: 10000002,
    originLocationId: JITA,
    destinationLocationId: AMARR,
    reward: 12_000_000,
    volume: 60_000,
    collateral: 900_000_000,
    daysToComplete: 5,
    dateExpired: Date.parse('2099-09-10T00:00:00Z'),
    ...overrides,
  };
}

const JITA_TO_AMARR = courierRow();
const AMARR_TO_STRUCTURE = courierRow({
  contractId: 501,
  regionId: 10000043,
  originLocationId: AMARR,
  destinationLocationId: UNKNOWN_STRUCTURE,
  reward: 30_000_000,
  collateral: undefined,
  daysToComplete: undefined,
});

function snapshotRead<TRow>(rows: TRow[], overrides: Partial<CachedResult<never>> = {}) {
  return {
    cached: {
      data: { rows, lastSyncedAt: Date.parse('2026-09-12T18:30:00Z') },
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
      ...overrides,
    },
    revalidating: false,
  };
}

function cachedCourierSnapshot(
  rows: PublicCourierContractRow[]
): R2SnapshotRead<PublicCourierContractRow> {
  return snapshotRead(rows);
}

function cachedSnapshot(
  rows: PublicContractOfferRow[],
  overrides: Partial<CachedResult<never>> = {}
): R2SnapshotRead<PublicContractOfferRow> {
  const types = new Map<number, { typeId: number; count: number; cheapest: number | null }>();
  for (const row of rows) {
    const entry = types.get(row.typeId) ?? { typeId: row.typeId, count: 0, cheapest: null };
    entry.count += 1;
    if (row.price > 0 && (entry.cheapest === null || row.price < entry.cheapest))
      entry.cheapest = row.price;
    types.set(row.typeId, entry);
  }
  loadOfferIndex.mockResolvedValue({
    lastSyncedAt: Date.parse('2026-09-12T18:30:00Z'),
    types,
    regionIds: [...new Set(rows.map((row) => row.regionId))],
    r2: {},
  });
  loadOffersForTypes.mockImplementation(async (_index: unknown, ids: ReadonlySet<number> | null) =>
    rows.filter((row) => ids === null || ids.has(row.typeId))
  );
  return snapshotRead([], overrides);
}

beforeEach(async () => {
  clearJumpGraphIndex();
  clearMarketTypeIndex();
  await db.settings.clear();
  await db.esiCache.clear();
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: true });
  useCourierFilterPref.setState({ value: DEFAULT_COURIER_FILTER, hydrated: true });
  loadOfferIndex.mockReset();
  loadOfferIndex.mockResolvedValue(null);
  loadOffersForTypes.mockReset();
  loadOffersForTypes.mockResolvedValue(null);
  loadPublicContractOffers.mockReset();
  loadPublicContractOffers.mockResolvedValue(
    cachedSnapshot([TRIT_FORGE, TRIT_DOMAIN, PYERITE_AUCTION])
  );
  loadPublicCourierContracts.mockReset();
  loadPublicCourierContracts.mockResolvedValue(
    cachedCourierSnapshot([JITA_TO_AMARR, AMARR_TO_STRUCTURE])
  );
  loadRegionName.mockReset();
  loadRegionName.mockImplementation(async (regionId: number) =>
    regionId === 10000002 ? 'The Forge' : 'Domain'
  );
  loadContractLocationName.mockReset();
  loadContractLocationName.mockResolvedValue('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
  loadCharacterSolarSystemId.mockReset();
  loadCharacterSolarSystemId.mockResolvedValue(JITA_SYSTEM);
  loadPublicContractItems.mockReset();
  loadPublicContractItems.mockResolvedValue({
    data: {
      kind: 'items' as const,
      items: [{ record_id: 1, type_id: 34, quantity: 100, is_included: true }],
    },
    fetchedAt: new Date(),
    fromCache: false,
    truncated: false,
  });
  vi.mocked(loadSolarSystemJumps).mockImplementation(async () => JUMPS);
  clearNpcStationIndex();
  clearSolarSystemIndex();
});

async function bodyRows() {
  const table = await screen.findByRole('table');
  await waitFor(() => {});
  const [, ...rest] = within(table).getAllByRole('rowgroup');
  return within(rest[0]).getAllByRole('row');
}

function SearchTabHarness() {
  const [status, setStatus] = useState<ContractSearchStatus | null>(null);
  const [mode, setMode] = useState<ContractMode>('items');
  return (
    <>
      <button
        type="button"
        onClick={() => status?.refresh()}
        disabled={status === null || status.loading}
      >
        Refresh
      </button>
      <button type="button" onClick={() => setMode('items')}>
        Items
      </button>
      <button type="button" onClick={() => setMode('courier')}>
        Courier
      </button>
      <ContractSearchPanel mode={mode} onStatusChange={setStatus} />
    </>
  );
}

const SEARCHING = '/?items.minQty=0';

function renderWithRouter(initialEntries: string[] = [SEARCHING]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SearchTabHarness />
    </MemoryRouter>
  );
}

describe('ContractSearchPanel', () => {
  describe('PLEX-asking contracts', () => {
    const PLEX_BARTER = row({ contractId: 50, typeId: 34, price: 0, requestedPlex: 100 });

    afterEach(() => usePlexPrice.mockReturnValue(null));

    it('prices a PLEX ask at the PLEX market price and sorts it with the ISK offers', async () => {
      usePlexPrice.mockReturnValue(5_000);
      loadPublicContractOffers.mockResolvedValue(cachedSnapshot([TRIT_FORGE, PLEX_BARTER]));
      renderWithRouter();

      const rows = await bodyRows();
      expect(within(rows[0]).getByText('incl. 100 PLEX')).toBeInTheDocument();
    });

    it('states the PLEX ask as it is, sorted last, while no PLEX price is known', async () => {
      loadPublicContractOffers.mockResolvedValue(cachedSnapshot([PLEX_BARTER, TRIT_FORGE]));
      renderWithRouter();

      const rows = await bodyRows();
      expect(within(rows[1]).getByText('100 PLEX')).toBeInTheDocument();
    });

    it('drops PLEX-asking and auction contracts behind the Exclude filter', async () => {
      loadPublicContractOffers.mockResolvedValue(
        cachedSnapshot([TRIT_FORGE, PLEX_BARTER, PYERITE_AUCTION])
      );
      renderWithRouter(['/?items.hidePlex=1&items.hideAuctions=1']);

      const rows = await bodyRows();
      expect(rows).toHaveLength(1);
      expect(within(rows[0]).queryByText(/PLEX/)).not.toBeInTheDocument();
    });
  });

  it('lists every synced offer, any item type, cheapest first', async () => {
    renderWithRouter();

    const rows = await bodyRows();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Tritanium',
      'Tritanium',
      'Pyerite',
    ]);
  });

  it('sorts every offer cheapest-first and windows them, with no cap to lift (issue #1777)', async () => {
    const dear = Array.from({ length: 60 }, (_, i) =>
      row({ contractId: 100 + i, price: 10_000_000 - i, quantity: 1 })
    );
    const cheapest = row({ contractId: 999, price: 1, quantity: 7 });
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([...dear, cheapest]));
    renderWithRouter();

    const rows = await bodyRows();
    expect(rows.length).toBeLessThan(61);
    expect(within(rows[0]).getByText('7')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument();
    expect(screen.getByText('61 offers')).toBeInTheDocument();
  });

  it('names the system each offer sits in, with its security', async () => {
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([
        row({ contractId: 1, price: 1, locationId: JITA }),
        row({ contractId: 2, price: 2, locationId: UNKNOWN_STRUCTURE }),
      ])
    );
    renderWithRouter();

    expect(await screen.findByRole('columnheader', { name: /System/ })).toBeInTheDocument();
    await waitFor(async () => {
      const rows = await bodyRows();
      expect(within(rows[0]).getByText('Jita')).toBeInTheDocument();
      expect(within(rows[0]).getByText('0.9')).toBeInTheDocument();
      const systemCell = rows[1].querySelector('[data-label="System"]');
      expect(systemCell).not.toBeNull();
      expect(within(systemCell as HTMLElement).getByText('—')).toBeInTheDocument();
    });
  });

  it('narrows to offers within the chosen jump range of the current system', async () => {
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([
        row({ contractId: 1, price: 1, locationId: JITA }),
        row({ contractId: 2, price: 2, locationId: AMARR }),
      ])
    );
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.click(screen.getByRole('combobox', { name: 'Distance' }));
    await user.click(screen.getByRole('option', { name: 'Current system' }));

    await waitFor(async () => expect(await bodyRows()).toHaveLength(1));
    const rows = await bodyRows();
    expect(within(rows[0]).getByText('Jita')).toBeInTheDocument();
  });

  it("shows each offer's own distance from the current system, even with no range filter applied", async () => {
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([
        row({ contractId: 1, price: 1, locationId: JITA }),
        row({ contractId: 2, price: 2, locationId: AMARR }),
      ])
    );
    renderWithRouter();

    await waitFor(async () => {
      const rows = await bodyRows();
      const jumpsCell = (index: number) => rows[index].querySelector('[data-label="Jumps"]');
      expect(within(jumpsCell(0) as HTMLElement).getByText('0')).toBeInTheDocument();
      expect(within(jumpsCell(1) as HTMLElement).getByText('4')).toBeInTheDocument();
    });
  });

  it('explains an unfiltered range with no current system even with the filter funnel closed', async () => {
    loadCharacterSolarSystemId.mockResolvedValue(null);
    renderWithRouter(['/?items.jumps=3']);

    await waitFor(() =>
      expect(screen.getAllByText('Set your current system to filter by distance.')).toHaveLength(2)
    );
    expect(screen.queryByRole('group', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('draws no Items/Courier switch of its own — the route tabs pick the corpus', async () => {
    render(
      <MemoryRouter initialEntries={[SEARCHING]}>
        <ContractSearchPanel mode="items" />
      </MemoryRouter>
    );
    await bodyRows();

    expect(screen.queryByRole('group', { name: 'Contract kind' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Courier' })).not.toBeInTheDocument();
  });

  it('names a listed type the market catalogue lacks, such as an unmarketable blueprint copy', async () => {
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([row({ contractId: 7, typeId: 48098, price: 40_000 })])
    );
    renderWithRouter();

    const rows = await bodyRows();
    await waitFor(() =>
      expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent(
        'Baryon Exotic Plasma S Blueprint'
      )
    );
  });

  it('names the region each offer sits in', async () => {
    renderWithRouter();

    const rows = await bodyRows();
    expect(within(rows[0]).getByText('Domain')).toBeInTheDocument();
    expect(within(rows[1]).getByText('The Forge')).toBeInTheDocument();
  });

  it("marks an auction's price as a buyout rather than a fixed ask", async () => {
    renderWithRouter();

    const rows = await bodyRows();
    expect(within(rows[2]).getByText('buyout')).toBeInTheDocument();
  });

  it('calls a zero-buyout auction what it is — a starting bid, at its own price', async () => {
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([row({ typeId: 35, isAuction: true, price: 3_000_000, buyout: 0 })])
    );
    renderWithRouter();

    const rows = await bodyRows();
    expect(within(rows[0]).getByText('bid')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('buyout')).not.toBeInTheDocument();
  });

  it('announces how many items match the typed text', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();

    await user.type(screen.getByPlaceholderText('Search item name…'), 'trit');

    const status = await screen.findByText('1 matching item, listed below the search');
    expect(status).toHaveAttribute('role', 'status');
  });

  it('narrows to one item type when a suggestion is picked, and summarises its offers', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();

    await user.type(screen.getByPlaceholderText('Search item name…'), 'trit');
    const suggestions = await screen.findByRole('list', { name: 'Matching items' });
    await user.click(within(suggestions).getByRole('button', { name: /Tritanium/ }));

    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
    expect(screen.getByText('Offers').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Cheapest')).toBeInTheDocument();
    expect(screen.getByText('Median')).toBeInTheDocument();
  });

  it('narrows on a free-text query even when no suggestion is picked', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();

    await user.type(screen.getByPlaceholderText('Search item name…'), 'pyer');

    await waitFor(async () => {
      const rows = await bodyRows();
      expect(rows).toHaveLength(1);
      expect(within(rows[0]).getByText('Pyerite')).toBeInTheDocument();
    });
  });

  it('says so when a query matches no listed item, rather than falling back to everything', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();

    await user.type(screen.getByPlaceholderText('Search item name…'), 'zzzz');

    expect(await screen.findByText('No public contracts match your filters.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByText('Search to see contract offers')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search item name…')).toHaveValue('');
  });

  it('resets a non-search filter (max price) that empties the list', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.type(screen.getByRole('textbox', { name: 'Max price' }), '1');

    expect(await screen.findByText('No public contracts match your filters.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByText('Search to see contract offers')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Max price' })).toHaveValue('');
  });

  it('takes ISK shorthand in max price (issue #2227)', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    expect(await bodyRows()).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.type(screen.getByRole('textbox', { name: 'Max price' }), '1.5m');

    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
  });

  it('says nothing has synced yet for an empty snapshot', async () => {
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([]));
    renderWithRouter();

    expect(await screen.findByText('No public contracts synced yet')).toBeInTheDocument();
  });

  it('says the index could not be reached, not "synced yet", when the read returned nothing', async () => {
    loadPublicContractOffers.mockResolvedValue({ cached: null, revalidating: false });
    loadOfferIndex.mockResolvedValue(null);
    renderWithRouter();

    expect(
      await screen.findAllByText("Can't reach contract search, and nothing is saved yet")
    ).not.toHaveLength(0);
    expect(screen.queryByText('No public contracts synced yet')).not.toBeInTheDocument();

    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([]));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No public contracts synced yet')).toBeInTheDocument();
  });
});

describe('ContractSearchPanel — zero-price (barter) offers (issue #1080)', () => {
  it('sorts a zero-price row last in the default view, not first as the cheapest', async () => {
    const barter = row({ contractId: 900, typeId: 34, price: 0, quantity: 1 });
    const priced = row({ contractId: 901, typeId: 35, price: 500_000, quantity: 1 });
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([barter, priced]));
    renderWithRouter();

    const rows = await bodyRows();
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getAllByRole('cell')[0].textContent).toBe('Pyerite');
    expect(within(rows[1]).getAllByRole('cell')[0].textContent).toBe('Tritanium');
  });

  it('marks a zero-price row as asking for goods rather than showing it as the cheapest thing on the page', async () => {
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([row({ contractId: 900, price: 0, quantity: 1 })])
    );
    renderWithRouter();

    const rows = await bodyRows();
    expect(within(rows[0]).getByText('Asking for goods')).toBeInTheDocument();
    expect(within(rows[0]).getByText('0.00 ISK', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('does not mark an ordinary positive-price row', async () => {
    renderWithRouter();

    const rows = await bodyRows();
    for (const r of rows) {
      expect(within(r).queryByText('Asking for goods')).not.toBeInTheDocument();
    }
  });

  it('keeps a zero-price row last even when the Price column is sorted descending, not first', async () => {
    const barter = row({ contractId: 900, typeId: 34, price: 0, quantity: 1 });
    const priced = row({ contractId: 901, typeId: 35, price: 500_000, quantity: 1 });
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([barter, priced]));
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();

    const header = screen.getByRole('columnheader', { name: 'Price' });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await user.click(screen.getByRole('button', { name: 'Price' }));
    expect(header).toHaveAttribute('aria-sort', 'descending');

    const rows = await bodyRows();
    expect(within(rows[0]).getAllByRole('cell')[0].textContent).toBe('Pyerite');
    expect(within(rows[1]).getAllByRole('cell')[0].textContent).toBe('Tritanium');
  });
});

describe('ContractSearchPanel — contract detail modal', () => {
  it('opens the shared contract detail modal on a row click, the same one BPC Search and Contracts History use', async () => {
    const user = userEvent.setup();
    renderWithRouter();

    const rows = await bodyRows();
    await user.click(rows[0]);

    expect(await screen.findByText('Everything on this contract')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Domain');
    expect(loadPublicContractItems).toHaveBeenCalledWith(TRIT_DOMAIN.contractId);
  });

  it('checks the ask against the live hub price, since a listing is something you can still take', async () => {
    getHubPricesWithStatus.mockResolvedValue({
      prices: new Map([[34, { sellMin: 6_000, buyMax: 5_000 }]]),
      unreachable: false,
    } as never);
    const user = userEvent.setup();
    renderWithRouter();

    const rows = await bodyRows();
    await user.click(rows[0]);

    const check = await screen.findByRole('region', { name: 'Is it fair? · Jita 4-4 right now' });
    expect(await within(check).findByText('600,000 ISK')).toBeInTheDocument();
    expect(within(check).getByText('+16.7%')).toBeInTheDocument();
  });

  it("holds a blueprint copy per run against similar copies, never against the original's hub price", async () => {
    getHubPricesWithStatus.mockResolvedValue({
      prices: new Map([[638, { sellMin: 1_135_000_000, buyMax: 1_000_000_000 }]]),
      unreachable: false,
    } as never);
    const copy = (contractId: number, price: number, over = {}) =>
      row({
        contractId,
        typeId: 638,
        price,
        quantity: 1,
        isBlueprintCopy: true,
        me: 10,
        te: 20,
        runs: 5,
        ...over,
      });
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([
        copy(21, 4_000_000),
        copy(22, 5_000_000),
        copy(23, 5_500_000),
        copy(24, 6_000_000, { me: 9 }),
      ])
    );
    const user = userEvent.setup();
    renderWithRouter(['/?items.type=638']);

    await user.click((await bodyRows())[0]);

    const check = await screen.findByRole('region', {
      name: 'Is it fair? · 3 similar copies for sale now',
    });
    expect(within(check).getByText('800,000 ISK')).toBeInTheDocument();
    expect(within(check).getByText('1,100,000 ISK')).toBeInTheDocument();
    expect(screen.queryByText('1,135,000,000 ISK')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sell orders' })).not.toBeInTheDocument();
  });

  it('tags the line that was searched for in the detail, and nothing when no search is active', async () => {
    const user = userEvent.setup();
    const first = renderWithRouter(['/?items.type=34&items.q=Tritanium']);
    await user.click((await bodyRows())[0]);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Your search')).toBeInTheDocument();
    first.unmount();

    renderWithRouter();
    await user.click((await bodyRows())[0]);
    const plain = await screen.findByRole('dialog');
    await within(plain).findByText('Everything on this contract');
    expect(within(plain).queryByText('Your search')).not.toBeInTheDocument();
  });

  it('closes on request, leaving the table underneath untouched', async () => {
    const user = userEvent.setup();
    renderWithRouter();

    const rows = await bodyRows();
    await user.click(rows[0]);
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await bodyRows()).toHaveLength(3);
  });
});

describe('ContractSearchPanel — Courier mode', () => {
  async function showCourier() {
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();
    await user.click(screen.getByRole('button', { name: 'Courier' }));
    return user;
  }

  it('names both ends by system rather than by station', async () => {
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const [measurable] = rows;
    expect(within(measurable).getByText(/Jita/)).toBeInTheDocument();
    expect(within(measurable).queryByText(/Jita IV - Moon 4/)).not.toBeInTheDocument();
    expect(within(measurable).getAllByText('The Forge').length).toBeGreaterThan(0);
  });

  it('ranks by ISK per jump, so a haul with no measurable distance sorts last', async () => {
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    await waitFor(() => {
      expect(within(rows[0]).getAllByRole('cell')[JUMPS_CELL]).toHaveTextContent('4');
    });
    expect(within(rows[1]).getByText(new RegExp(String(UNKNOWN_STRUCTURE)))).toBeInTheDocument();
  });

  it('re-measures every haul when the route preference changes', async () => {
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    await waitFor(() => {
      expect(within(rows[0]).getAllByRole('cell')[JUMPS_CELL]).toHaveTextContent('4');
    });

    await userEvent.click(screen.getByRole('button', { name: /filters/i }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Route' }));
    await userEvent.click(screen.getByRole('option', { name: 'Prefer shorter' }));

    await waitFor(async () => {
      const refreshed = await bodyRows();
      expect(within(refreshed[0]).getAllByRole('cell')[JUMPS_CELL]).toHaveTextContent('2');
    });
  });

  it('ranks by reward and says so when the jump graph cannot be read', async () => {
    vi.mocked(loadSolarSystemJumps).mockRejectedValue(new Error('offline'));
    clearJumpGraphIndex();
    await showCourier();

    expect(await screen.findByText(/Jump distances are unavailable right now/)).toBeInTheDocument();
  });

  it('shows what a haul pays per cubic metre, beside the rate it ranks on', async () => {
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const cells = within(rows[0])
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells[ISK_PER_VOLUME_CELL]).toBe('200');
  });

  it('has no rate per cubic metre for a haul that states no cargo', async () => {
    loadPublicCourierContracts.mockResolvedValue(
      cachedCourierSnapshot([courierRow({ contractId: 700, volume: 0 })])
    );
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(1);
      return found;
    });
    const cells = within(rows[0])
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells[ISK_PER_VOLUME_CELL]).toBe('—');
  });

  it('says no collateral was asked for, rather than reporting a ratio of zero', async () => {
    loadPublicCourierContracts.mockResolvedValue(
      cachedCourierSnapshot([courierRow({ contractId: 701, collateral: undefined })])
    );
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(1);
      return found;
    });
    await userEvent.click(rows[0]);

    const dialog = await screen.findByRole('dialog');
    const collateral = within(dialog).getByText('Collateral').parentElement;
    expect(collateral).toHaveTextContent('—');
    expect(collateral).toHaveTextContent('none asked for');
    expect(collateral).not.toHaveTextContent('0×');
  });

  it('has no collateral ratio against a haul that pays nothing', async () => {
    loadPublicCourierContracts.mockResolvedValue(
      cachedCourierSnapshot([courierRow({ contractId: 702, reward: 0 })])
    );
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(1);
      return found;
    });
    await userEvent.click(rows[0]);

    const dialog = await screen.findByRole('dialog');
    const collateral = within(dialog).getByText('Collateral').parentElement;
    expect(collateral).toHaveTextContent('900M');
    expect(collateral).not.toHaveTextContent('Infinity');
    expect(collateral).not.toHaveTextContent('the reward');
  });

  it('keeps ISK per jump as the default sort, not the new rate', async () => {
    await showCourier();
    await waitFor(async () => {
      expect(await bodyRows()).toHaveLength(2);
    });
    const sorted = screen
      .getAllByRole('columnheader')
      .find((header) => header.getAttribute('aria-sort') === 'descending');
    expect(sorted).toHaveTextContent('ISK/jump');
  });

  it('states the collateral against the reward in the detail, where the risk is judged', async () => {
    await showCourier();
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const withCollateral = rows.find(
      (candidate) => !candidate.textContent?.includes(String(UNKNOWN_STRUCTURE))
    )!;

    await userEvent.click(withCollateral);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Collateral').parentElement).toHaveTextContent(
      '75× the reward'
    );
  });

  it('shows a location nothing local names as its id rather than inventing one', async () => {
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const unnamed = rows.find((candidate) =>
      candidate.textContent?.includes(String(UNKNOWN_STRUCTURE))
    );
    expect(unnamed).toBeDefined();
  });

  it('says a haul asks for no collateral and states no deadline, rather than showing zeroes', async () => {
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const withoutCollateral = rows.find((candidate) =>
      candidate.textContent?.includes(String(UNKNOWN_STRUCTURE))
    )!;
    const withCollateral = rows.find((candidate) => candidate !== withoutCollateral)!;
    const cells = within(withoutCollateral)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells[COLLATERAL_CELL]).toBe('—');
    expect(cells[JUMPS_CELL]).toBe('—');
    expect(cells[ISK_PER_JUMP_CELL]).toBe('—');
    const stated = within(withCollateral)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(stated[COLLATERAL_CELL]).not.toBe('—');
  });

  it('leads the detail with the rate the board itself ranks on', async () => {
    await showCourier();
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const jitaToAmarr = rows.find(
      (candidate) => !candidate.textContent?.includes(String(UNKNOWN_STRUCTURE))
    )!;

    await userEvent.click(jitaToAmarr);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Per jump').parentElement).toHaveTextContent('3M');
    expect(within(dialog).getByText('Per jump').parentElement).toHaveTextContent(
      '3,000,000 ISK over 4 jumps'
    );
  });

  it('states a free haul as paying nothing per jump, not as having no rate', async () => {
    loadPublicCourierContracts.mockResolvedValue(
      cachedCourierSnapshot([courierRow({ contractId: 703, reward: 0 })])
    );
    await showCourier();
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(1);
      return found;
    });

    await userEvent.click(rows[0]);

    const dialog = await screen.findByRole('dialog');
    const perJump = within(dialog).getByText('Per jump').parentElement;
    expect(perJump).toHaveTextContent('0 ISK over 4 jumps');
    expect(perJump).not.toHaveTextContent('—');
  });

  it('quotes no rate per jump when no gate route reaches an end', async () => {
    await showCourier();
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const toStructure = rows.find((candidate) =>
      candidate.textContent?.includes(String(UNKNOWN_STRUCTURE))
    )!;

    await userEvent.click(toStructure);

    const dialog = await screen.findByRole('dialog');
    const perJump = within(dialog).getByText('Per jump').parentElement;
    expect(perJump).toHaveTextContent('—');
    expect(perJump).not.toHaveTextContent('30M');
  });

  it("keeps both ends' region in the detail rather than clipping it off", async () => {
    await showCourier();
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const jitaToAmarr = rows.find(
      (candidate) => !candidate.textContent?.includes(String(UNKNOWN_STRUCTURE))
    )!;

    await userEvent.click(jitaToAmarr);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Pick up').parentElement).toHaveTextContent('The Forge');
    expect(within(dialog).getByText('Drop off').parentElement).toHaveTextContent('Domain');
  });

  it('names the two systems in the title rather than repeating both stations', async () => {
    await showCourier();
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const jitaToAmarr = rows.find(
      (candidate) => !candidate.textContent?.includes(String(UNKNOWN_STRUCTURE))
    )!;

    await userEvent.click(jitaToAmarr);

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Courier · Jita → Amarr' })
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Caldari Navy Assembly Plant/)).toHaveLength(1);
  });

  it('states an absent deadline as unstated in the detail, which is where it lives', async () => {
    await showCourier();
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });

    const unstated = rows.find((candidate) =>
      candidate.textContent?.includes(String(UNKNOWN_STRUCTURE))
    )!;
    await userEvent.click(unstated);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Time to deliver').parentElement).toHaveTextContent('—');
  });

  it('swaps the item filters out for route filters, rather than stacking both', async () => {
    await showCourier();

    expect(await screen.findByPlaceholderText('Search pickup or drop-off…')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search item name…')).not.toBeInTheDocument();
  });

  it('narrows the hauls by a route search over either end', async () => {
    const user = await showCourier();
    const search = await screen.findByPlaceholderText('Search pickup or drop-off…');

    await user.type(search, 'jita');

    await waitFor(async () => {
      const rows = await bodyRows();
      expect(rows).toHaveLength(1);
      expect(within(rows[0]).getByText(/Jita/)).toBeInTheDocument();
    });
  });

  it('says so when no haul matches, without claiming nothing synced', async () => {
    const user = await showCourier();
    const search = await screen.findByPlaceholderText('Search pickup or drop-off…');

    await user.type(search, 'rens');

    expect(await screen.findByText('No courier contracts match your filters.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    await waitFor(async () => expect(await bodyRows()).not.toHaveLength(0));
    expect(screen.getByPlaceholderText('Search pickup or drop-off…')).toHaveValue('');
  });

  it('reports an empty courier snapshot on its own terms, not as an empty offers one', async () => {
    loadPublicCourierContracts.mockResolvedValue(cachedCourierSnapshot([]));
    await showCourier();

    expect(await screen.findByText('No public courier contracts synced yet')).toBeInTheDocument();
    expect(screen.queryByText('No public contracts synced yet')).not.toBeInTheDocument();
  });

  it('keeps the item results reachable after a trip through Courier', async () => {
    const user = await showCourier();
    await screen.findByPlaceholderText('Search pickup or drop-off…');

    await user.click(screen.getByRole('button', { name: 'Items' }));

    expect(await screen.findByPlaceholderText('Search item name…')).toBeInTheDocument();
  });

  it('opens a courier-specific detail modal on a row click, with no item contents section', async () => {
    const user = await showCourier();
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });

    await user.click(rows[0]);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Amarr VIII (Oris)');
    expect(screen.queryByText('Everything on this contract')).not.toBeInTheDocument();
    expect(loadPublicContractItems).not.toHaveBeenCalled();
  });

  it('closes the courier detail modal on request', async () => {
    const user = await showCourier();
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });

    await user.click(rows[0]);
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ContractSearchPanel — Build Plan from an item row', () => {
  function renderWithProbe() {
    return render(
      <MemoryRouter initialEntries={[SEARCHING]}>
        <ContractSearchPanel mode="items" />
        <LocationProbe />
      </MemoryRouter>
    );
  }

  const BPC_ROW = row({
    contractId: 9,
    typeId: 638,
    price: 5_000_000,
    isBlueprintCopy: true,
    me: 10,
    te: 20,
    runs: 5,
  });

  it('offers the same Build Plan from the visible More-actions button (#2060)', async () => {
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([BPC_ROW]));
    renderWithProbe();

    await bodyRows();
    const twin = await screen.findByRole('button', { name: /^More actions for/ });
    fireEvent.pointerDown(twin, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/industry/plans?product=587&me=10&te=20&runs=5'
      );
    });
  });

  it("plans the copy a blueprint row names, at that copy's own ME/TE/runs", async () => {
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([BPC_ROW]));
    renderWithProbe();

    const rows = await bodyRows();
    fireEvent.contextMenu(rows[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/industry/plans?product=587&me=10&te=20&runs=5'
      );
    });
  });

  it('plans a plain item row as itself, unseeded', async () => {
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([row({ contractId: 8, typeId: 587 })])
    );
    renderWithProbe();

    const rows = await bodyRows();
    fireEvent.contextMenu(rows[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/industry\/plans\?product=587$/);
    });
  });

  it('offers nothing on a row no blueprint builds', async () => {
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([TRIT_FORGE]));
    renderWithProbe();

    const rows = await bodyRows();
    fireEvent.contextMenu(rows[0]);

    expect(await screen.findByRole('menuitem', { name: 'No blueprint options' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});

describe('ContractSearchPanel — Courier endpoint space', () => {
  const TO_LOWSEC = courierRow({ contractId: 601, destinationLocationId: RANCER });
  const TO_NULL = courierRow({ contractId: 602, destinationLocationId: NULL_STATION });
  const TO_STRUCTURE = courierRow({ contractId: 604, destinationLocationId: UNKNOWN_STRUCTURE });

  async function showCourierWith(rows: PublicCourierContractRow[]) {
    loadPublicCourierContracts.mockResolvedValue(cachedCourierSnapshot(rows));
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();
    await user.click(screen.getByRole('button', { name: 'Courier' }));
    await screen.findByRole('table');
    return user;
  }

  async function openFilters(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Filters' }));
  }

  function spaceGroup() {
    return screen.getByRole('group', { name: 'Destination space' });
  }

  async function courierRows() {
    const table = await screen.findByRole('table');
    const [, ...rest] = within(table).getAllByRole('rowgroup');
    return within(rest[0]).getAllByRole('row');
  }

  it('rates both ends of every haul by security status', async () => {
    await showCourierWith([JITA_TO_AMARR, TO_LOWSEC, TO_NULL]);

    const cells = (await courierRows()).map(
      (r) => within(r).getAllByRole('cell')[0].textContent ?? ''
    );

    expect(cells.every((cell) => cell.includes('Jita0.9'))).toBe(true);
    expect(cells.some((cell) => cell.includes('Rancer0.4'))).toBe(true);
    expect(cells.some((cell) => cell.includes('Vale0.0'))).toBe(true);
    expect(cells.some((cell) => /Highsec|Lowsec|Nullsec/.test(cell))).toBe(false);
  });

  it('prints no security for a destination it cannot place, rather than guessing', async () => {
    await showCourierWith([TO_STRUCTURE]);

    const route = within((await courierRows())[0]).getAllByRole('cell')[0];
    const [, destination] = (route.textContent ?? '').split('→');
    expect(destination).toBeDefined();
    expect(destination).not.toMatch(/\d\.\d/);
    expect(route).not.toHaveTextContent('Unknown space');
  });

  it('offers only the bands these hauls actually end in', async () => {
    const user = await showCourierWith([JITA_TO_AMARR, TO_LOWSEC]);
    await openFilters(user);

    const chips = within(spaceGroup())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(chips).toEqual(['Highsec', 'Lowsec']);
  });

  it('hides the band filter entirely when no haul on the board carries one', async () => {
    const user = await showCourierWith([TO_STRUCTURE]);
    await openFilters(user);

    expect(screen.queryByRole('group', { name: 'Destination space' })).not.toBeInTheDocument();
  });

  it('narrows the table to hauls ending in a chosen band', async () => {
    const user = await showCourierWith([JITA_TO_AMARR, TO_LOWSEC, TO_NULL]);
    await openFilters(user);

    for (const band of ['Highsec', 'Nullsec']) {
      await user.click(within(spaceGroup()).getByRole('button', { name: band }));
    }

    const rows = await courierRows();
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent('Rancer');
  });

  it('keeps an unplaceable destination while every offered band is selected', async () => {
    await showCourierWith([JITA_TO_AMARR, TO_STRUCTURE]);

    expect(await courierRows()).toHaveLength(2);
  });

  it('names the endpoint, not the route, so nothing reads as a safety claim', async () => {
    const user = await showCourierWith([JITA_TO_AMARR]);
    await openFilters(user);

    expect(spaceGroup()).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /route/i })).not.toBeInTheDocument();
  });

  it('says why a narrowed band filter dropped the hauls it cannot place', async () => {
    const user = await showCourierWith([TO_LOWSEC, TO_STRUCTURE]);
    await openFilters(user);

    await user.click(within(spaceGroup()).getByRole('button', { name: 'Lowsec' }));

    expect(await screen.findByText(/can't locate/i)).toBeInTheDocument();
  });

  it('does not blame unplaceable destinations for an emptiness another filter caused', async () => {
    const user = await showCourierWith([TO_LOWSEC, TO_STRUCTURE]);
    await openFilters(user);

    await user.click(within(spaceGroup()).getByRole('button', { name: 'Lowsec' }));
    await user.type(screen.getByLabelText('Min reward'), '999999999999');

    expect(await screen.findByText(/match your filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/can't locate/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
    expect(screen.getByLabelText('Min reward')).toHaveValue('');
  });
});

describe('ContractSearchPanel — Courier completion risk', () => {
  const TO_STRUCTURE = courierRow({ contractId: 701, destinationLocationId: UNKNOWN_STRUCTURE });
  const FROM_STRUCTURE = courierRow({ contractId: 702, originLocationId: UNKNOWN_STRUCTURE });
  const OUT_OF_WORMHOLE = courierRow({
    contractId: 703,
    regionId: 11000031,
    originLocationId: UNKNOWN_STRUCTURE,
  });
  const TO_NULLSEC = courierRow({ contractId: 704, destinationLocationId: NULL_STATION });

  async function showCourierWith(rows: PublicCourierContractRow[]) {
    loadPublicCourierContracts.mockResolvedValue(cachedCourierSnapshot(rows));
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();
    await user.click(screen.getByRole('button', { name: 'Courier' }));
    await screen.findByRole('table');
    return user;
  }

  async function courierRows() {
    const table = await screen.findByRole('table');
    const [, ...rest] = within(table).getAllByRole('rowgroup');
    return within(rest[0]).getAllByRole('row');
  }

  it('flags a delivery to a player structure, beside the delivery end', async () => {
    await showCourierWith([TO_STRUCTURE]);

    const route = within((await courierRows())[0]).getAllByRole('cell')[0];
    expect(within(route).getByText('Structure')).toBeInTheDocument();
  });

  it('does not flag a pickup from a player structure', async () => {
    await showCourierWith([FROM_STRUCTURE]);

    const route = within((await courierRows())[0]).getAllByRole('cell')[0];
    expect(within(route).queryByText('Structure')).not.toBeInTheDocument();
  });

  it('never reads an unreadable station table as a board full of player structures', async () => {
    const { loadNpcStations } = await import('@/sde/loadMarketSde');
    vi.mocked(loadNpcStations).mockRejectedValue(new Error('offline'));
    clearNpcStationIndex();
    await showCourierWith([JITA_TO_AMARR, TO_STRUCTURE]);

    expect(screen.queryByText('Structure')).not.toBeInTheDocument();
    vi.mocked(loadNpcStations).mockImplementation(async () => STATIONS);
  });

  it('says a wormhole haul has no gate route, not an unknown distance', async () => {
    await showCourierWith([OUT_OF_WORMHOLE]);

    const route = within((await courierRows())[0]).getAllByRole('cell')[0];
    expect(within(route).getByText('No gate route')).toBeInTheDocument();
  });

  it('marks nullsec informationally, with no warning marker of its own', async () => {
    await showCourierWith([TO_NULLSEC]);

    const route = within((await courierRows())[0]).getAllByRole('cell')[0];
    expect(route).toHaveTextContent('Vale0.0');
    expect(within(route).queryByText('No gate route')).not.toBeInTheDocument();
    expect(within(route).queryByText('Structure')).not.toBeInTheDocument();
  });

  it('hides what cannot be delivered on request, and keeps nullsec work', async () => {
    const user = await showCourierWith([JITA_TO_AMARR, TO_STRUCTURE, OUT_OF_WORMHOLE, TO_NULLSEC]);
    expect(await courierRows()).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Hide risky routes' }));

    const remaining = await courierRows();
    expect(remaining).toHaveLength(2);
    const routes = remaining.map((r) => within(r).getAllByRole('cell')[0].textContent ?? '');
    expect(routes.some((route) => route.includes('Vale0.0'))).toBe(true);
    expect(routes.some((route) => route.includes('Structure'))).toBe(false);
    expect(routes.some((route) => route.includes('No gate route'))).toBe(false);
  });

  it('spells each flag out in the detail, where the decision is made', async () => {
    const user = await showCourierWith([TO_STRUCTURE]);
    await user.click((await courierRows())[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/keeps your collateral/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/you do not have access/i)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Collateral')).toBeInTheDocument();
  });
});

describe('ContractSearchPanel — Courier going rate', () => {
  function corpus(count: number, reward: number, volume = 45_000) {
    return Array.from({ length: count }, (_, i) =>
      courierRow({ contractId: 800 + i, reward, volume })
    );
  }
  const ORDINARY = corpus(20, 15_000_000);
  const BAIT = courierRow({ contractId: 900, reward: 900_000_000, volume: 45_000 });

  async function showCourierWith(rows: PublicCourierContractRow[]) {
    loadPublicCourierContracts.mockResolvedValue(cachedCourierSnapshot(rows));
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();
    await user.click(screen.getByRole('button', { name: 'Courier' }));
    await screen.findByRole('table');
    return user;
  }

  async function courierRows() {
    const table = await screen.findByRole('table');
    const [, ...rest] = within(table).getAllByRole('rowgroup');
    return within(rest[0]).getAllByRole('row');
  }

  it('shows every haul as a multiple of the market going rate', async () => {
    await showCourierWith([...ORDINARY, BAIT]);

    const first = await waitFor(async () => {
      const found = (await courierRows())[0];
      expect(found.textContent).toMatch(/going rate/);
      return found;
    });
    expect(first.textContent).toMatch(/60x going rate/);
    const rest = (await courierRows()).slice(1);
    expect(rest.every((r) => (r.textContent ?? '').includes('1x going rate'))).toBe(true);
  });

  it('flags the haul that pays far above the going rate', async () => {
    await showCourierWith([...ORDINARY, BAIT]);

    const flagged = await waitFor(async () => {
      const found = (await courierRows())[0];
      expect(within(found).getByText(/60x going rate/)).toBeInTheDocument();
      return found;
    });
    expect(within(flagged).getByText(/60x going rate/).className).toMatch(/warning/);
  });

  it('shows no multiple at all for a corpus too small to have a median', async () => {
    await showCourierWith([JITA_TO_AMARR, AMARR_TO_STRUCTURE]);

    const rows = await courierRows();
    expect(rows.map((r) => r.textContent ?? '').join(' ')).not.toMatch(/going rate/);
  });

  it('states no rate for a haul with no measurable distance', async () => {
    await showCourierWith([...ORDINARY, AMARR_TO_STRUCTURE]);

    const unmeasurable = await waitFor(async () => {
      const found = (await courierRows()).find((r) =>
        (r.textContent ?? '').includes(`#${UNKNOWN_STRUCTURE}`)
      );
      expect(found).toBeDefined();
      return found!;
    });
    expect(unmeasurable.textContent).not.toMatch(/going rate/);
  });

  it('narrows to, or away from, the hauls far above the going rate', async () => {
    const user = await showCourierWith([...ORDINARY, BAIT]);
    await waitFor(async () => {
      expect(await courierRows()).toHaveLength(21);
    });

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('combobox', { name: 'Pay vs going rate' }));
    await user.click(await screen.findByRole('option', { name: 'Only far above' }));

    expect(await courierRows()).toHaveLength(1);
  });

  it('names a delivery into a system haulers are most often killed in', async () => {
    await showCourierWith([courierRow({ contractId: 950, destinationLocationId: UEDAMA_STATION })]);

    const route = within((await courierRows())[0]).getAllByRole('cell')[0];
    expect(within(route).getByText('Gank gate')).toBeInTheDocument();
    expect(route).toHaveTextContent('Uedama0.5');
  });

  it('names the benchmark in the detail, and calls nothing a scam', async () => {
    const user = await showCourierWith([...ORDINARY, BAIT]);
    await waitFor(async () => {
      expect((await courierRows())[0].textContent).toMatch(/going rate/);
    });
    await user.click((await courierRows())[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Pay vs going rate')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'About Pay vs going rate' })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Community minimum')).toBeInTheDocument();
    expect(within(dialog).getByText('Expires')).toBeInTheDocument();
    expect(within(dialog).queryByText(/scam/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/fraud|bad faith|dishonest/i)).not.toBeInTheDocument();
  });

  it('flags collateral far above the reward in the detail, and only there', async () => {
    const user = await showCourierWith([
      courierRow({ contractId: 960, reward: 45_000_000, collateral: 50_000_000_000 }),
    ]);
    const [row] = await courierRows();
    expect(within(row).queryByText('High collateral')).not.toBeInTheDocument();
    await user.click(row);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('High collateral')).toBeInTheDocument();
    expect(within(dialog).getByText(/Collateral is 1,111\.1× the reward/)).toBeInTheDocument();
    expect(within(dialog).getByText('Before you accept')).toBeInTheDocument();
    expect(within(dialog).getByText(/paying 22\.5% of it/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/scam/i)).not.toBeInTheDocument();
  });

  it('leaves ordinary high-value freight unflagged', async () => {
    const user = await showCourierWith([
      courierRow({ contractId: 961, reward: 25_000_000, collateral: 1_000_000_000 }),
    ]);
    await user.click((await courierRows())[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('High collateral')).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/of it$/)).not.toBeInTheDocument();
  });
});

describe('ContractSearchPanel — Courier reverse lane', () => {
  const OUTBOUND = courierRow({ contractId: 599, reward: 12_000_000, collateral: 1_000_000 });
  const RETURN_LEG = courierRow({
    contractId: 600,
    regionId: 10000043,
    originLocationId: AMARR,
    destinationLocationId: JITA,
    reward: 9_000_000,
    collateral: 900_000_000,
  });

  async function showCourierWith(rows: PublicCourierContractRow[]) {
    loadPublicCourierContracts.mockResolvedValue(cachedCourierSnapshot(rows));
    const user = userEvent.setup();
    renderWithRouter();
    await bodyRows();
    await user.click(screen.getByRole('button', { name: 'Courier' }));
    await screen.findByRole('table');
    return user;
  }

  async function openHaul(user: ReturnType<typeof userEvent.setup>, contractId: number) {
    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    for (const row of rows) {
      await user.click(row);
      const dialog = await screen.findByRole('dialog');
      if (within(dialog).queryByText(String(contractId)) !== null) return dialog;
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
    throw new Error(`no row opened contract ${contractId}`);
  }

  it('counts the outstanding hauls running the lane backwards', async () => {
    const user = await showCourierWith([OUTBOUND, RETURN_LEG]);

    const dialog = await openHaul(user, OUTBOUND.contractId);

    expect(
      within(dialog).getByRole('button', { name: '1 haul runs the reverse lane' })
    ).toBeInTheDocument();
  });

  it('closes and searches the lane backwards when the count is activated', async () => {
    const user = await showCourierWith([OUTBOUND, RETURN_LEG]);
    const dialog = await openHaul(user, OUTBOUND.contractId);

    await user.click(within(dialog).getByRole('button', { name: '1 haul runs the reverse lane' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const remaining = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(1);
      return found;
    });
    expect(remaining[0]).toHaveTextContent('9M');
  });

  it('says a haul with no matching return leg has none, and offers no dead link', async () => {
    const user = await showCourierWith([OUTBOUND]);

    const dialog = await openHaul(user, OUTBOUND.contractId);

    expect(
      within(dialog).getByText('No outstanding haul runs the reverse lane.')
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /reverse lane/ })).not.toBeInTheDocument();
  });

  it('says how many return hauls it could not place, rather than leaving them out silently', async () => {
    const user = await showCourierWith([OUTBOUND, AMARR_TO_STRUCTURE]);

    const dialog = await openHaul(user, OUTBOUND.contractId);

    expect(
      within(dialog).getByText(
        "No known haul runs the reverse lane. 1 leaves Domain for a drop-off we can't locate."
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText('No outstanding haul runs the reverse lane.')
    ).not.toBeInTheDocument();
  });

  it('counts the way home and the hauls it could not place as two separate lines', async () => {
    const placeable = courierRow({
      contractId: 602,
      regionId: 10000043,
      originLocationId: AMARR,
      destinationLocationId: JITA,
      reward: 8_000_000,
      collateral: 1_000_000,
    });
    const user = await showCourierWith([OUTBOUND, placeable, AMARR_TO_STRUCTURE]);

    const dialog = await openHaul(user, OUTBOUND.contractId);

    expect(
      within(dialog).getByRole('button', { name: '1 haul runs the reverse lane' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("1 more leaves Domain for a drop-off we can't locate.")
    ).toBeInTheDocument();
  });

  it('counts only the return hauls the board it opens will actually show', async () => {
    const ordinary = Array.from({ length: 20 }, (_, i) =>
      courierRow({ contractId: 810 + i, reward: 15_000_000, volume: 45_000, collateral: 1_000_000 })
    );
    const bait = courierRow({
      contractId: 899,
      reward: 900_000_000,
      volume: 45_000,
      collateral: 1_000_000,
    });
    const ordinaryReturn = courierRow({
      contractId: 898,
      regionId: 10000043,
      originLocationId: AMARR,
      destinationLocationId: JITA,
      reward: 15_000_000,
      volume: 45_000,
      collateral: 1_000_000,
    });
    const user = await showCourierWith([...ordinary, bait, ordinaryReturn]);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('combobox', { name: 'Pay vs going rate' }));
    await user.click(await screen.findByRole('option', { name: 'Only far above' }));

    const dialog = await openHaul(user, bait.contractId);

    expect(within(dialog).queryByRole('button', { name: /reverse lane/ })).not.toBeInTheDocument();
    expect(
      within(dialog).getByText('No outstanding haul runs the reverse lane.')
    ).toBeInTheDocument();
  });

  it('has no lane to look up for a haul whose drop-off is a player structure', async () => {
    const user = await showCourierWith([OUTBOUND, AMARR_TO_STRUCTURE]);

    const dialog = await openHaul(user, AMARR_TO_STRUCTURE.contractId);

    expect(
      within(dialog).getByText(
        "We can't locate one end of this haul, so we can't look for a return haul."
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText('No outstanding haul runs the reverse lane.')
    ).not.toBeInTheDocument();
  });

  it('keeps the other filters the hauler set when it swaps the two regions', async () => {
    const affordable = courierRow({
      contractId: 601,
      regionId: 10000043,
      originLocationId: AMARR,
      destinationLocationId: JITA,
      reward: 8_000_000,
      collateral: 1_000_000,
    });
    const user = await showCourierWith([OUTBOUND, affordable, RETURN_LEG]);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.type(screen.getByLabelText('Max collateral'), '50000000');

    const dialog = await openHaul(user, OUTBOUND.contractId);

    expect(
      within(dialog).getByRole('button', { name: '1 haul runs the reverse lane' })
    ).toBeInTheDocument();
  });
});

describe('ContractSearchPanel — search first (issue #2921)', () => {
  it('asks for a search instead of listing offers when nothing is filtered', async () => {
    renderWithRouter(['/']);

    expect(await screen.findByText('Search to see contract offers')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search item name…')).toBeInTheDocument();
  });

  it('keeps the search box usable while the index loads, and says it is loading', async () => {
    const offers = deferred<R2SnapshotRead<PublicContractOfferRow>>();
    loadPublicContractOffers.mockReturnValue(offers.promise);
    renderWithRouter(['/']);

    expect(await screen.findByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Loading contract offers…')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search item name…')).toBeEnabled();

    offers.resolve(cachedSnapshot([TRIT_FORGE]));
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.getByText('Search to see contract offers')).toBeInTheDocument();
  });

  describe('with the R2 index published', () => {
    const INDEX = {
      lastSyncedAt: 1,
      types: new Map([
        [34, { typeId: 34, count: 2, cheapest: 500_000 }],
        [35, { typeId: 35, count: 1, cheapest: null }],
      ]),
      regionIds: [10000002, 10000043],
    };

    it('asks for a search, with the search box, when R2 returns the index and no rows', async () => {
      loadPublicContractOffers.mockResolvedValue(cachedSnapshot([]));
      loadOfferIndex.mockResolvedValue(INDEX);
      renderWithRouter(['/']);

      expect(await screen.findByText('Search to see contract offers')).toBeInTheDocument();
      expect(screen.queryByText('No public contracts synced yet')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search item name…')).toBeInTheDocument();
    });

    it('suggests item names, with counts, from the index alone', async () => {
      loadPublicContractOffers.mockReturnValue(
        deferred<R2SnapshotRead<PublicContractOfferRow>>().promise
      );
      loadOfferIndex.mockResolvedValue(INDEX);
      const user = userEvent.setup();
      renderWithRouter(['/']);

      await user.type(await screen.findByPlaceholderText('Search item name…'), 'trit');

      const suggestions = await screen.findByRole('list', { name: 'Matching items' });
      expect(within(suggestions).getByRole('button', { name: /Tritanium/ })).toHaveTextContent(
        '2 offers'
      );
    });

    it('shows a pinned item from just its chunks while the full snapshot is still downloading', async () => {
      loadPublicContractOffers.mockReturnValue(
        deferred<R2SnapshotRead<PublicContractOfferRow>>().promise
      );
      loadOfferIndex.mockResolvedValue(INDEX);
      loadOffersForTypes.mockResolvedValue([TRIT_FORGE, TRIT_DOMAIN]);
      renderWithRouter(['/?items.type=34&items.q=Tritanium']);

      expect(await bodyRows()).toHaveLength(2);
      expect(loadOffersForTypes).toHaveBeenCalledWith(INDEX, new Set([34]));
    });

    it('stops waiting when the type read fails, since no full snapshot is coming (issue #4270)', async () => {
      loadPublicContractOffers.mockReturnValue(
        deferred<R2SnapshotRead<PublicContractOfferRow>>().promise
      );
      loadOfferIndex.mockResolvedValue(INDEX);
      loadOffersForTypes.mockResolvedValue(null);
      renderWithRouter(['/?items.type=34&items.q=Tritanium']);

      expect(
        await screen.findByText('Loading public contracts, this may take a moment.')
      ).toBeInTheDocument();
      expect(
        await screen.findAllByText("Can't reach contract search, and nothing is saved yet")
      ).not.toHaveLength(0);
      expect(
        screen.queryByText('Loading public contracts, this may take a moment.')
      ).not.toBeInTheDocument();
    });

    it('reads every offer on a search that names no item', async () => {
      loadPublicContractOffers.mockReturnValue(
        deferred<R2SnapshotRead<PublicContractOfferRow>>().promise
      );
      loadOfferIndex.mockResolvedValue(INDEX);
      loadOffersForTypes.mockResolvedValue([TRIT_FORGE]);
      renderWithRouter(['/?items.maxPrice=1000000000']);

      expect(await bodyRows()).toHaveLength(1);
      expect(loadOffersForTypes).toHaveBeenCalledWith(INDEX, null);
    });
  });

  it('treats a filter other than the item name as a search', async () => {
    renderWithRouter(['/?items.maxPrice=1000000000']);

    expect(await bodyRows()).not.toHaveLength(0);
    expect(screen.queryByText('Search to see contract offers')).not.toBeInTheDocument();
  });

  it('waits behind a spinner, filter bar intact, when a search arrives before the snapshot', async () => {
    const offers = deferred<R2SnapshotRead<PublicContractOfferRow>>();
    loadPublicContractOffers.mockReturnValue(offers.promise);
    renderWithRouter(['/?items.maxPrice=1000000000']);

    expect(
      await screen.findByText('Loading public contracts, this may take a moment.')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search item name…')).toBeInTheDocument();

    offers.resolve(cachedSnapshot([TRIT_FORGE]));
    expect(await bodyRows()).toHaveLength(1);
  });
});

describe('ContractSearchPanel — progressive loading', () => {
  it('renders the courier board while the offers snapshot is still in flight', async () => {
    const offers = deferred<R2SnapshotRead<PublicContractOfferRow>>();
    loadPublicContractOffers.mockReturnValue(offers.promise);
    const user = userEvent.setup();
    renderWithRouter();

    await user.click(screen.getByRole('button', { name: 'Courier' }));

    const table = await screen.findByRole('table');
    const [, ...rest] = within(table).getAllByRole('rowgroup');
    expect(within(rest[0]).getAllByRole('row')).toHaveLength(2);
    offers.resolve(cachedSnapshot([TRIT_FORGE]));
  });

  it('renders the item board while the courier snapshot is still in flight', async () => {
    const courier = deferred<R2SnapshotRead<PublicCourierContractRow>>();
    loadPublicCourierContracts.mockReturnValue(courier.promise);
    renderWithRouter();

    expect(await bodyRows()).toHaveLength(3);
    courier.resolve(cachedCourierSnapshot([JITA_TO_AMARR]));
  });

  it('says which corpus it is loading rather than showing a bare spinner', async () => {
    const offers = deferred<R2SnapshotRead<PublicContractOfferRow>>();
    loadPublicContractOffers.mockReturnValue(offers.promise);
    renderWithRouter();

    expect(
      await screen.findByRole('status', {
        name: 'Loading public contracts, this may take a moment.',
      })
    ).toBeInTheDocument();
    offers.resolve(cachedSnapshot([TRIT_FORGE]));
  });

  it('never claims an empty corpus while that corpus is still loading', async () => {
    const offers = deferred<R2SnapshotRead<PublicContractOfferRow>>();
    loadPublicContractOffers.mockReturnValue(offers.promise);
    loadOfferIndex.mockResolvedValue(null);
    renderWithRouter();

    await screen.findByRole('status', {
      name: 'Loading public contracts, this may take a moment.',
    });
    expect(screen.queryByText('No public contracts synced yet')).not.toBeInTheDocument();

    offers.resolve(cachedSnapshot([]));
    expect(await screen.findByText('No public contracts synced yet')).toBeInTheDocument();
  });

  it('names regions out of the local SDE, not one ESI call per region', async () => {
    renderWithRouter();

    const rows = await bodyRows();
    expect(within(rows[0]).getByText('Domain')).toBeInTheDocument();
    expect(loadRegionName).not.toHaveBeenCalled();
  });

  it('falls back to ESI for a region the local table does not carry', async () => {
    const WORMHOLE_REGION = 11000031;
    vi.mocked(loadRegionName).mockResolvedValue('Thera');
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([row({ contractId: 9, regionId: WORMHOLE_REGION })])
    );
    renderWithRouter();

    const rows = await bodyRows();
    await waitFor(() => {
      expect(within(rows[0]).getByText('Thera')).toBeInTheDocument();
    });
    expect(loadRegionName).toHaveBeenCalledWith(WORMHOLE_REGION);
    expect(loadRegionName).toHaveBeenCalledTimes(1);
  });

  it('does not call a typed query unmatched while the item names are still loading', async () => {
    const catalog = deferred<MarketTypeEntry[]>();
    vi.mocked(loadMarketTypes).mockReturnValue(catalog.promise);
    const user = userEvent.setup();
    renderWithRouter();

    await screen.findByRole('table');
    await user.type(screen.getByPlaceholderText('Search item name…'), 'tritanium');

    expect(await screen.findByRole('status', { name: 'Loading item names…' })).toBeInTheDocument();
    expect(screen.queryByText('No contracts match your filters')).not.toBeInTheDocument();

    catalog.resolve(CATALOG);
    expect(await screen.findAllByText('Tritanium')).not.toHaveLength(0);
  });

  it('states a refresh that fell back to cache, rather than repeating the offline banner', async () => {
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([TRIT_FORGE], { fromCache: true }));
    const user = userEvent.setup();
    renderWithRouter();

    await bodyRows();
    expect(screen.getByText('Showing cached data')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Refresh failed — showing cached data')).toBeInTheDocument();
  });
});

describe("ContractSearchPanel — a row's primary action beats its name links (§6c)", () => {
  it('renders the item cell as plain text: the row opens the contract modal', async () => {
    renderWithRouter();

    const rows = await bodyRows();
    expect(within(rows[0]).queryByRole('link', { name: 'Tritanium' })).not.toBeInTheDocument();
    expect(within(rows[0]).getByText('Tritanium')).toBeInTheDocument();
  });
});

describe('ContractSearchPanel — Below market (#3989)', () => {
  const book = (price: number) => ({
    sellMin: price,
    buyMax: price,
    sellVolume: 0,
    buyVolume: 0,
  });
  const WANTS_ITEMS = row({
    contractId: 9,
    typeId: 35,
    price: 1,
    quantity: 10,
    requestsItems: true,
  });
  const NO_MARKET = 99_999;
  const BLUEPRINTY = [
    row({ contractId: 20, typeId: 34, price: 1_000, quantity: 1 }),
    row({ contractId: 20, typeId: NO_MARKET, price: 1_000, quantity: 10 }),
  ];
  const COMPARABLES = [30, 31, 32].map((contractId) =>
    row({ contractId, typeId: NO_MARKET, price: 100_000, quantity: 10, regionId: 10000043 })
  );

  afterEach(() => {
    getHubPricesWithStatus.mockImplementation(async () => NO_HUB_PRICES);
  });

  beforeEach(() => {
    useBelowMarketSide.setState({ value: 'sell', hydrated: false });
    getHubPricesWithStatus.mockResolvedValue({
      prices: new Map([
        [34, book(8_000)],
        [35, book(300_000)],
      ]),
      unreachable: false,
    });
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([TRIT_FORGE, TRIT_DOMAIN, PYERITE_AUCTION, WANTS_ITEMS])
    );
  });

  it('shows one row per contract worth more than it asks, best profit first, with no search', async () => {
    renderWithRouter(['/?items.belowMarket=1']);
    const table = await screen.findByRole('table', { name: 'Below-market contracts' });
    await waitFor(() => {});
    const [, body] = within(table).getAllByRole('rowgroup');
    const rows = within(body).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Pyerite');
    expect(rows[0]).toHaveTextContent('1,000,000');
    expect(rows[0]).not.toHaveTextContent('priced');
    expect(rows[1]).toHaveTextContent('Tritanium');
    expect(rows[1]).toHaveTextContent('300,000');
    expect(screen.getByText(/lowest sell order, before fees/)).toBeInTheDocument();
  });

  it('prices the buy side when Buy orders is picked', async () => {
    getHubPricesWithStatus.mockResolvedValue({
      prices: new Map([
        [34, { sellMin: 8_000, buyMax: 4_000, sellVolume: 0, buyVolume: 0 }],
        [35, book(300_000)],
      ]),
      unreachable: false,
    });
    const user = userEvent.setup();
    renderWithRouter(['/?items.belowMarket=1']);
    await screen.findByRole('table', { name: 'Below-market contracts' });
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('combobox', { name: 'Value at' }));
    await user.click(await screen.findByRole('option', { name: 'Buy orders' }));
    await waitFor(() => {
      const table = screen.getByRole('table', { name: 'Below-market contracts' });
      expect(within(table).queryByText(/Tritanium/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/best buy order, before fees/)).toBeInTheDocument();
  });

  describe('contracts valued from other contracts (#5427)', () => {
    beforeEach(() => {
      loadPublicContractOffers.mockResolvedValue(
        cachedSnapshot([...BLUEPRINTY, ...COMPARABLES, TRIT_FORGE])
      );
    });

    it('hides a contract profitable only through other contracts, and lists it when asked', async () => {
      loadPublicContractOffers.mockResolvedValue(
        cachedSnapshot([
          row({ contractId: 20, typeId: 34, price: 50_000, quantity: 1 }),
          row({ contractId: 20, typeId: NO_MARKET, price: 50_000, quantity: 10 }),
          ...COMPARABLES,
        ])
      );
      const user = userEvent.setup();
      renderWithRouter(['/?items.belowMarket=1']);
      await screen.findByText(/Contracts as of/);
      await waitFor(() =>
        expect(screen.queryByRole('status', { name: /Pricing/ })).not.toBeInTheDocument()
      );
      expect(screen.queryByRole('table', { name: 'Below-market contracts' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Filters' }));
      await user.click(screen.getByRole('button', { name: 'Include Other' }));
      const table = await screen.findByRole('table', { name: 'Below-market contracts' });
      const [, body] = within(table).getAllByRole('rowgroup');
      const [only] = within(body).getAllByRole('row');
      expect(only).toHaveTextContent('8,000');
      expect(only).toHaveTextContent('100,000');
      expect(only).toHaveTextContent('1 of 2 priced');
      expect(only).toHaveTextContent('58,000 ISK');
    });

    it('shows Other with a one-word header and a dash where a contract has none', async () => {
      loadPublicContractOffers.mockResolvedValue(cachedSnapshot([...BLUEPRINTY, ...COMPARABLES]));
      renderWithRouter(['/?items.belowMarket=1&items.bmOther=1']);
      const table = await screen.findByRole('table', { name: 'Below-market contracts' });
      expect(within(table).getByRole('columnheader', { name: /^Other/ })).toBeInTheDocument();
      const [, body] = within(table).getAllByRole('rowgroup');
      expect(within(body).getAllByRole('row')[0]).toHaveTextContent('100,000');
    });
  });

  it('opens a slide-over whose hub figure matches the row to the ISK, on the same side', async () => {
    getHubPricesWithStatus.mockResolvedValue({
      prices: new Map([
        [34, { sellMin: 8_123, buyMax: 4_000, sellVolume: 0, buyVolume: 0 }],
        [35, book(300_000)],
      ]),
      unreachable: false,
    });
    const user = userEvent.setup();
    renderWithRouter(['/?items.belowMarket=1']);
    const table = await screen.findByRole('table', { name: 'Below-market contracts' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(1));
    const tritRow = within(table)
      .getAllByRole('row')
      .find((r) => r.textContent?.includes('Tritanium'));
    expect(tritRow).toHaveTextContent('812,300 ISK');
    await user.click(tritRow as HTMLElement);
    const check = await screen.findByRole('region', { name: /^Is it fair/ });
    expect(await within(check).findByText('812,300 ISK')).toBeInTheDocument();
    expect(within(check).getByRole('button', { name: 'Sell orders' })).toBeInTheDocument();
  });

  it('toggles from the offer table through the chip', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    await screen.findByRole('table', { name: 'Contract Search' });
    await user.click(screen.getByRole('button', { name: /Below market/ }));
    expect(
      await screen.findByRole('table', { name: 'Below-market contracts' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /columns/i })).not.toBeInTheDocument();
  });
});

describe('ContractSearchPanel — overpriced flags (#4773)', () => {
  const FAIR = row({ contractId: 11, price: 900_000, lineCount: 1 });
  const TRAP = row({ contractId: 12, price: 9_000_000, lineCount: 1 });
  const BUNDLE = row({ contractId: 13, price: 9_500_000, lineCount: 5 });
  const STACK_A = row({ contractId: 15, price: 9_900_000, lineCount: 2 });
  const STACK_B = row({ contractId: 15, price: 9_900_000, quantity: 50, lineCount: 2 });
  const OLD_PUBLISH = row({ contractId: 14, price: 8_800_000 });
  const FLAG = { name: 'Priced far above market' };

  beforeEach(() => {
    getHubPricesWithStatus.mockResolvedValue({
      prices: new Map([[34, { sellMin: 8_000, buyMax: null, sellVolume: 0, buyVolume: 0 }]]),
      unreachable: false,
    });
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([FAIR, TRAP, BUNDLE, OLD_PUBLISH]));
  });

  afterEach(() => {
    getHubPricesWithStatus.mockImplementation(async () => NO_HUB_PRICES);
  });

  it('marks only the single-type contract asking far above the hub sell', async () => {
    renderWithRouter();
    const flag = await screen.findByRole('img', FLAG);
    expect(screen.getAllByRole('img', FLAG)).toHaveLength(1);
    expect(flag.closest('tr')).toHaveTextContent('9M');
    expect(await bodyRows()).toHaveLength(4);
  });

  it('never marks a contract that carries several stacks', async () => {
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([STACK_A, STACK_B]));
    renderWithRouter();
    expect(await bodyRows()).toHaveLength(2);
    expect(screen.queryByRole('img', FLAG)).not.toBeInTheDocument();
  });

  it('says nothing while the hub has no price for the item', async () => {
    getHubPricesWithStatus.mockResolvedValue({ prices: new Map(), unreachable: false });
    renderWithRouter();
    await bodyRows();
    expect(screen.queryByRole('img', FLAG)).not.toBeInTheDocument();
  });

  it('Hide overpriced drops the flagged row and says how many it hid', async () => {
    renderWithRouter(['/?items.minQty=0&items.hideOverpriced=1']);
    expect(await screen.findByText('1 overpriced contract hidden')).toBeInTheDocument();
    const rows = await bodyRows();
    expect(rows).toHaveLength(3);
    expect(screen.queryByRole('img', FLAG)).not.toBeInTheDocument();
  });

  it('prints no count when nothing is flagged', async () => {
    getHubPricesWithStatus.mockResolvedValue({ prices: new Map(), unreachable: false });
    renderWithRouter(['/?items.minQty=0&items.hideOverpriced=1']);
    expect(await bodyRows()).toHaveLength(4);
    expect(screen.queryByText(/overpriced contract/)).not.toBeInTheDocument();
  });
});
