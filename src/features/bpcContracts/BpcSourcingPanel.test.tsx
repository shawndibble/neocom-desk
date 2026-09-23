import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { DEFAULT_SPACE_FILTER, useSpaceFilter } from '@/features/bpcContracts/bpcSpaceFilterPref';
import {
  DEFAULT_VISIBLE_BPC_SEARCH_COLUMNS,
  useVisibleBpcSearchColumns,
} from '@/features/bpcContracts/bpcSearchColumns';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { isSyncConfigured } from '@/app/syncStatus';
import { App } from '@/app/App';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { SpaceKind } from '@/engine/space';
import type { PublicBpcContractsSnapshot } from '@/features/bpcContracts/syncedContracts';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type { CharacterBlueprint, RegionOrder } from '@/esi/endpoints';
import type { BlueprintMap } from '@/sde/types';
import type { GlobalMarketEntry } from '@/sde/marketTypes';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// The panel is a tab on Industry, so mounting it mounts Industry's own
// loaders too — `loadPi` included. Same stub set as Industry.test.tsx.
vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async (): Promise<BlueprintMap> => BLUEPRINTS),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

vi.mock('@/app/syncStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/syncStatus')>();
  return { ...actual, isSyncConfigured: vi.fn(() => true) };
});

const loadPublicBpcContracts = vi.fn();
vi.mock('@/features/bpcContracts/syncedContracts', () => ({
  loadPublicBpcContracts: (...args: unknown[]) => loadPublicBpcContracts(...args),
}));

const loadRegionName = vi.fn(async (regionId: number) =>
  regionId === 10000002 ? 'The Forge' : 'Domain'
);
vi.mock('@/features/bpcContracts/regionNames', () => ({
  loadRegionName: (...args: [number]) => loadRegionName(...args),
}));

const loadCharacterBlueprints = vi.fn();
vi.mock('@/features/industry/data', () => ({
  loadCharacterBlueprints: (...args: unknown[]) => loadCharacterBlueprints(...args),
  findOwnedBlueprint: vi.fn(),
}));

// Location resolution (`blueprintLocation.ts`) goes through the SDE snapshot
// and, for player structures, ESI — neither of which this file otherwise
// mocks. Mocked directly at the module boundary so Space-filter/column tests
// control what each `location_id` resolves to without needing a real fetch.
const loadBlueprintLocation = vi
  .fn<
    (
      characterId: number,
      locationId: number
    ) => Promise<{ name: string | null; regionId: number | null; space: SpaceKind | null }>
  >()
  .mockResolvedValue({ name: null, regionId: null, space: null });
const loadContractLocationInfo = vi
  .fn<(locationId: number) => Promise<{ name: string | null; space: SpaceKind | null }>>()
  .mockResolvedValue({ name: null, space: null });
vi.mock('@/features/bpcContracts/blueprintLocation', () => ({
  loadBlueprintLocation: (...args: [number, number]) => loadBlueprintLocation(...args),
  loadContractLocationInfo: (...args: [number]) => loadContractLocationInfo(...args),
}));

// BPO cards place a station by its system (issue #1241), through the same
// local SDE lookups Item Offers uses. Only the Jita hub station is known.
vi.mock('@/sde/npcStations', () => ({
  lookupNpcStation: vi.fn(async (stationId: number) =>
    stationId === 60003760
      ? { id: 60003760, name: 'Jita IV - Moon 4', systemId: 30000142, typeId: 1 }
      : null
  ),
}));
vi.mock('@/sde/solarSystems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/sde/solarSystems')>();
  return {
    ...actual,
    lookupSolarSystem: vi.fn(async (systemId: number) =>
      systemId === 30000142
        ? { id: 30000142, name: 'Jita', security: 0.9459, regionId: 10000002 }
        : undefined
    ),
  };
});

// Market BPO lookups (issue #1241). Empty books unless a test says otherwise.
const getOrderBook =
  vi.fn<
    (
      regionId: number,
      typeId: number
    ) => Promise<{ orders: RegionOrder[]; truncated: boolean; fetchedAt: number }>
  >();
vi.mock('@/features/market/orderBook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/market/orderBook')>();
  return {
    ...actual,
    getOrderBook: (...args: [number, number]) => getOrderBook(...args),
  };
});

// No item trades in a Global Market Region unless a test says otherwise.
const loadGlobalMarkets = vi.fn<() => Promise<GlobalMarketEntry[]>>();
vi.mock('@/sde/loadMarketSde', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/sde/loadMarketSde')>();
  return { ...actual, loadGlobalMarkets: () => loadGlobalMarkets() };
});

function sellOrder(overrides: Partial<RegionOrder> = {}): RegionOrder {
  return {
    duration: 365,
    is_buy_order: false,
    issued: '2026-09-01T00:00:00Z',
    location_id: 60003760,
    min_volume: 1,
    order_id: 77,
    price: 2_000_000,
    range: 'region',
    system_id: 30000142,
    type_id: 638,
    volume_remain: 4,
    volume_total: 4,
    ...overrides,
  };
}

function ownedResult(
  blueprints: CharacterBlueprint[],
  needsReauth = false
): StatusResult<CharacterBlueprint[]> {
  return {
    cached: { data: blueprints, fetchedAt: new Date(), fromCache: false, truncated: false },
    needsReauth,
  };
}

function ownedBlueprint(overrides: Partial<CharacterBlueprint> = {}): CharacterBlueprint {
  return {
    item_id: 1,
    type_id: 638,
    runs: 5,
    material_efficiency: 8,
    time_efficiency: 16,
    quantity: 1,
    location_id: 60003760,
    location_flag: 'Hangar',
    ...overrides,
  };
}

const BLUEPRINTS: BlueprintMap = {
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  '870': {
    name: 'Caracal Blueprint',
    time: 1200,
    materials: [],
    products: [{ typeID: 621, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
};

const CHAR_ID = 91;

function row(overrides: Partial<BpcContractRow> = {}): BpcContractRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 638,
    price: 5_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 5,
    quantity: 1,
    dateExpired: Date.parse('2099-09-10T00:00:00Z'),
    isMultiType: false,
    ...overrides,
  };
}

function cachedSnapshot(
  rows: BpcContractRow[],
  originals?: BpcContractRow[]
): CachedResult<PublicBpcContractsSnapshot> {
  return {
    data: { rows, originals, lastSyncedAt: Date.parse('2026-09-08T18:30:00Z') },
    fetchedAt: new Date(),
    fromCache: false,
    truncated: false,
  };
}

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  usePublicInfoModalStore.setState({ request: null });
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: false });
  // These two are Dexie-backed singletons (`createLocalSetting`): once
  // hydrated, `hydrate()` no-ops, so a value one test writes (e.g. toggling
  // the Space chips or a column) would otherwise leak into every later test
  // in this file despite `db.settings.clear()` above.
  useSpaceFilter.setState({ value: DEFAULT_SPACE_FILTER, hydrated: false });
  useVisibleBpcSearchColumns.setState({
    value: DEFAULT_VISIBLE_BPC_SEARCH_COLUMNS,
    hydrated: false,
  });
  loadPublicBpcContracts.mockReset();
  loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([]));
  loadCharacterBlueprints.mockReset();
  loadCharacterBlueprints.mockResolvedValue(ownedResult([]));
  loadBlueprintLocation.mockReset();
  loadBlueprintLocation.mockResolvedValue({ name: null, regionId: null, space: null });
  loadContractLocationInfo.mockReset();
  loadContractLocationInfo.mockResolvedValue({ name: null, space: null });
  vi.mocked(isSyncConfigured).mockReturnValue(true);
  getOrderBook.mockReset();
  getOrderBook.mockResolvedValue({ orders: [], truncated: false, fetchedAt: 0 });
  loadGlobalMarkets.mockReset();
  loadGlobalMarkets.mockResolvedValue([]);

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/industry?tab=sourcing');
});

describe('BpcSourcingPanel', () => {
  it('renders synced BPC rows with item name, ME/TE and price', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([row({ contractId: 1, typeId: 638, regionId: 10000002 })])
    );
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(within(table).getByText('10')).toBeInTheDocument();
    // The price cell shows shorthand ("5M"); its accessible name carries the
    // exact figure.
    expect(within(table).getByLabelText('5,000,000.00 ISK')).toBeInTheDocument();
  });

  it('marks a multi-type row’s price as the whole contract’s ask, and its ISK/run as unknowable (issue #1076)', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([row({ contractId: 1, typeId: 638, regionId: 10000002, isMultiType: true })])
    );
    const user = userEvent.setup();
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    await within(table).findByText('Rifter Blueprint');
    // The real ask is still shown, just marked — not silently hidden.
    expect(within(table).getByLabelText('5,000,000.00 ISK')).toBeInTheDocument();
    expect(within(table).getByText('Whole contract')).toBeInTheDocument();

    // ISK/run is not a default-visible column — switch it on first.
    await user.click(await screen.findByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'ISK/run' }));
    await user.keyboard('{Escape}');

    const iskPerRunCell = table.querySelector('[data-label="ISK/run"]');
    expect(iskPerRunCell).toHaveTextContent('—');
  });

  it('narrows the table to a typed item-name search', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([
        row({ contractId: 1, typeId: 638, regionId: 10000002 }),
        row({ contractId: 2, typeId: 870, regionId: 10000043 }),
      ])
    );
    const user = userEvent.setup();
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search blueprint name…'), 'Caracal');

    expect(within(table).queryByText('Rifter Blueprint')).not.toBeInTheDocument();
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();
  });

  it('shows an empty state, not a crash, when nothing has synced yet', async () => {
    loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([]));
    render(<App />);

    expect(await screen.findByText('No public BPC listings synced yet')).toBeInTheDocument();
  });

  it('shows a not-configured empty state rather than an empty table when sync is unavailable', async () => {
    vi.mocked(isSyncConfigured).mockReturnValue(false);
    render(<App />);

    expect(await screen.findByText("Public BPC search isn't available")).toBeInTheDocument();
  });

  it('right-clicking a row starts a Build Plan for the item the blueprint makes', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([row({ contractId: 1, typeId: 638, regionId: 10000002 })])
    );
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    fireEvent.contextMenu(within(table).getByText('Rifter Blueprint'));

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    // 587 (Rifter), not 638 (its blueprint): Industry resolves `?product=` via
    // the catalog's `byProductTypeID`, so handing it the blueprint's own
    // typeID would silently create nothing.
    await waitFor(() => {
      expect(window.location.search).toContain('product=587');
    });
  });

  it('still lands on the sourcing tab from the old /bpc-contracts link', async () => {
    loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([row({ contractId: 1, typeId: 638 })]));
    window.history.pushState({}, '', '/bpc-contracts');
    render(<App />);

    const tab = await screen.findByRole('tab', { name: 'BPC Search' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('table', { name: 'BPC Search' })).toBeInTheDocument();
  });

  it('suggests matching blueprints as you type, with how many offers each has', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([
        row({ contractId: 1, typeId: 638 }),
        row({ contractId: 2, typeId: 638 }),
        row({ contractId: 3, typeId: 870 }),
      ])
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('table', { name: 'BPC Search' });

    await user.type(screen.getByPlaceholderText('Search blueprint name…'), 'Rifter');

    const suggestions = screen.getByRole('list', { name: 'Matching blueprints' });
    expect(within(suggestions).getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(within(suggestions).getByText('2 offers')).toBeInTheDocument();
    expect(within(suggestions).queryByText('Caracal Blueprint')).not.toBeInTheDocument();
  });

  it('summarises one blueprint once it is picked from the suggestions', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([
        row({ contractId: 1, typeId: 638, price: 5_000_000 }),
        row({ contractId: 2, typeId: 638, price: 3_000_000 }),
        row({ contractId: 3, typeId: 638, price: 9_000_000, regionId: 10000043 }),
        row({ contractId: 4, typeId: 870 }),
      ])
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('table', { name: 'BPC Search' });

    await user.type(screen.getByPlaceholderText('Search blueprint name…'), 'Rifter');
    const suggestions = screen.getByRole('list', { name: 'Matching blueprints' });
    await user.click(within(suggestions).getByRole('button'));

    expect(screen.getByText('3 offers on contract')).toBeInTheDocument();
    // Scoped to the chips: these figures also appear in the region strip and
    // the table, which is the point — all three have to agree.
    expect(screen.getByText('Cheapest').parentElement).toContainElement(
      screen.getAllByLabelText('3,000,000.00 ISK')[0]
    );
    expect(screen.getByText('Median').parentElement).toContainElement(
      screen.getAllByLabelText('5,000,000.00 ISK')[0]
    );
    // The suggestion list closes once a blueprint is pinned.
    expect(screen.queryByRole('list', { name: 'Matching blueprints' })).not.toBeInTheDocument();
  });

  it('compares the cheapest offer per region for the picked blueprint', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([
        row({ contractId: 1, typeId: 638, price: 5_000_000, regionId: 10000002 }),
        row({ contractId: 2, typeId: 638, price: 3_000_000, regionId: 10000002 }),
        row({ contractId: 3, typeId: 638, price: 9_000_000, regionId: 10000043 }),
      ])
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('table', { name: 'BPC Search' });

    await user.type(screen.getByPlaceholderText('Search blueprint name…'), 'Rifter');
    await user.click(
      within(screen.getByRole('list', { name: 'Matching blueprints' })).getByRole('button')
    );

    const strip = screen.getByText('Cheapest by region').parentElement as HTMLElement;
    expect(within(strip).getByText('2 offers')).toBeInTheDocument();
    expect(within(strip).getByText('1 offer')).toBeInTheDocument();
    // Cheapest region first, so the order itself carries the answer.
    expect(within(strip).getAllByRole('listitem')[0]).toHaveTextContent('The Forge');
  });

  it('sorts price on what a row costs, so a stray buyout on an exchange cannot jump the queue', async () => {
    // EVE Ref's CSV carries a buyout on non-auction contracts whenever the
    // field parses, so `buyout ?? price` sorted this 5M exchange row to the
    // top at 0 while rendering it at 5M.
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([
        row({ contractId: 1, typeId: 638, price: 5_000_000, buyout: 0, isAuction: false }),
        row({ contractId: 2, typeId: 870, price: 1_000_000 }),
      ])
    );
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    // Row 0 is the header; the cheapest row must lead under the default sort.
    expect(
      within(within(table).getAllByRole('row')[1]).getByLabelText('1,000,000.00 ISK')
    ).toBeInTheDocument();
  });

  it('clearing the picked blueprint restores the full, browsable list', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([row({ contractId: 1, typeId: 638 }), row({ contractId: 2, typeId: 870 })])
    );
    const user = userEvent.setup();
    render(<App />);
    const table = await screen.findByRole('table', { name: 'BPC Search' });

    await user.type(screen.getByPlaceholderText('Search blueprint name…'), 'Rifter');
    await user.click(
      within(screen.getByRole('list', { name: 'Matching blueprints' })).getByRole('button')
    );
    expect(within(table).queryByText('Caracal Blueprint')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Clear blueprint filter: Rifter Blueprint' })
    );

    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
  });
});

describe('BpcSourcingPanel search matching', () => {
  /**
   * Every blueprint in the catalogue is named "… Blueprint", so a substring
   * search over the whole name made any query that is a substring of that one
   * shared word match all ~2,900 types — a search for "b" returned fifty
   * unrelated blueprints, which is what a user hit in practice.
   */
  it('does not match every blueprint through the shared "Blueprint" word', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([
        row({ contractId: 1, typeId: 638, regionId: 10000002 }),
        row({ contractId: 2, typeId: 870, regionId: 10000043 }),
      ])
    );
    const user = userEvent.setup();
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();

    // "rif" reaches Rifter; it is not a substring of "Caracal Blueprint".
    await user.type(screen.getByPlaceholderText(/search/i), 'rif');
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(within(table).queryByText('Caracal Blueprint')).not.toBeInTheDocument();

    // "blue" is in both names but only through the shared suffix, so it must
    // narrow to nothing rather than to everything.
    await user.clear(screen.getByPlaceholderText(/search/i));
    await user.type(screen.getByPlaceholderText(/search/i), 'blue');
    expect(within(table).queryByText('Rifter Blueprint')).not.toBeInTheDocument();
    expect(within(table).queryByText('Caracal Blueprint')).not.toBeInTheDocument();
  });

  it('still matches when the query spells out the full name', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([row({ contractId: 1, typeId: 638, regionId: 10000002 })])
    );
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('table', { name: 'BPC Search' });
    await user.type(screen.getByPlaceholderText(/search/i), 'Rifter Blueprint');

    // Re-queried rather than reused: a mid-typing query like "Rifter B"
    // matches nothing, which swaps the table for the empty state, so the
    // element captured before typing is detached by the time this runs.
    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
  });
});

describe('BpcSourcingPanel row identity', () => {
  /**
   * A contract routinely lists the same blueprint on several item lines — one
   * per copy — so `contractId:typeId` is not unique. Measured against a live
   * EVE Ref pull, 70% of rows shared a key with another row and one key
   * repeated 528 times. React cannot reconcile a changing list under
   * duplicate keys, which left rows from the previous render in the table:
   * picking a blueprint showed its offers *alongside* unrelated ones, while
   * the summary above (computed from data, not the DOM) read correctly.
   *
   * Every other fixture here gives each row its own contractId, which is why
   * nothing caught this.
   */
  it('drops the previous blueprint rows when a contract repeats one type', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([
        // One contract, the same blueprint four times — four identical keys.
        row({ contractId: 1, typeId: 638, price: 1_000_000 }),
        row({ contractId: 1, typeId: 638, price: 1_000_000 }),
        row({ contractId: 1, typeId: 638, price: 1_000_000 }),
        row({ contractId: 1, typeId: 638, price: 1_000_000 }),
        row({ contractId: 2, typeId: 870, price: 9_000_000 }),
      ])
    );
    const user = userEvent.setup();
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getAllByText('Rifter Blueprint')).toHaveLength(4);

    await user.type(screen.getByPlaceholderText(/search/i), 'Caracal');
    const narrowed = await screen.findByRole('table', { name: 'BPC Search' });

    expect(within(narrowed).getByText('Caracal Blueprint')).toBeInTheDocument();
    expect(within(narrowed).queryByText('Rifter Blueprint')).not.toBeInTheDocument();
  });
});

describe('BpcSourcingPanel source multiselect', () => {
  it('defaults to both sources on, showing contract and owned rows together', async () => {
    loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([row({ contractId: 1, typeId: 638 })]));
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([ownedBlueprint({ item_id: 1, type_id: 870 })])
    );
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Contracts' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Owned' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('with only Contracts selected, shows exactly the contract rows and no owned ones', async () => {
    loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([row({ contractId: 1, typeId: 638 })]));
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([ownedBlueprint({ item_id: 1, type_id: 870 })])
    );
    const user = userEvent.setup();
    render(<App />);
    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Owned' }));

    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(within(table).queryByText('Caracal Blueprint')).not.toBeInTheDocument();
  });

  it('with only Owned selected, shows the owned blueprint and not the contract row', async () => {
    loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([row({ contractId: 1, typeId: 638 })]));
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([ownedBlueprint({ item_id: 1, type_id: 870, quantity: 2 })])
    );
    const user = userEvent.setup();
    render(<App />);
    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Contracts' }));

    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();
    expect(within(table).queryByText('Rifter Blueprint')).not.toBeInTheDocument();
  });

  /**
   * The synced contract snapshot can run to six figures (ADR 0013), while a
   * character's owned blueprints realistically number in the dozens. If the
   * unified list concatenated contracts before owned rows, a > ROW_CAP
   * contract set would silently push every owned row past the default
   * (not-"show all") slice.
   */
  it('shows an owned row even when far more contract rows exist than the default row cap', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot(
        Array.from({ length: 60 }, (_, i) => row({ contractId: i + 1, typeId: 638, price: i }))
      )
    );
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([ownedBlueprint({ item_id: 1, type_id: 870 })])
    );
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();
  });

  it('renders an owned BPO original (runs -1) as unlimited runs, not -1', async () => {
    loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([]));
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([ownedBlueprint({ item_id: 1, type_id: 638, runs: -1 })])
    );
    const user = userEvent.setup();
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    await within(table).findByText('Rifter Blueprint');

    // Runs is not a default-visible column — switch it on first.
    await user.click(await screen.findByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Runs' }));
    await user.keyboard('{Escape}');

    expect(within(table).getByText('∞')).toBeInTheDocument();
    expect(within(table).queryByText('-1')).not.toBeInTheDocument();
  });

  it('shows no owned rows, not a crash, when the blueprints scope needs re-login', async () => {
    // Reauth messaging is Industry's page-level banner's job — assert Owned
    // just goes empty here.
    loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([row({ contractId: 1, typeId: 638 })]));
    loadCharacterBlueprints.mockResolvedValue(ownedResult([], true));
    const user = userEvent.setup();
    render(<App />);
    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();

    expect(screen.getByText('Log in again to see owned blueprints')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Contracts' }));

    expect(screen.getByText('No BPC listings match your filters.')).toBeInTheDocument();
  });

  it('shows a dedicated empty state when every source is deselected', async () => {
    loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([row({ contractId: 1, typeId: 638 })]));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('table', { name: 'BPC Search' });

    await user.click(screen.getByRole('button', { name: 'Contracts' }));
    await user.click(screen.getByRole('button', { name: 'Owned' }));

    expect(screen.getByText('Select at least one source to search.')).toBeInTheDocument();
  });

  it('a region filter narrows out an owned row whose location has not resolved', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([row({ contractId: 1, typeId: 638, regionId: 10000002 })])
    );
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([ownedBlueprint({ item_id: 1, type_id: 870 })])
    );
    const user = userEvent.setup();
    render(<App />);
    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Region' }));
    await user.click(await screen.findByRole('option', { name: 'The Forge' }));

    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(within(table).queryByText('Caracal Blueprint')).not.toBeInTheDocument();
  });

  it('a region filter matches an owned row once its location resolves into that region', async () => {
    // Region options come from synced contract rows only, so the contract
    // here shares the region the owned blueprint's location resolves
    // into — the point under test is that the owned row survives the
    // filter too, not that it displaces the contract row.
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([row({ contractId: 1, typeId: 638, regionId: 10000002 })])
    );
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([ownedBlueprint({ item_id: 1, type_id: 870, location_id: 60003760 })])
    );
    loadBlueprintLocation.mockResolvedValue({
      name: 'Jita IV - Moon 4',
      regionId: 10000002,
      space: 'highsec',
    });
    const user = userEvent.setup();
    render(<App />);
    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Region' }));
    await user.click(await screen.findByRole('option', { name: 'The Forge' }));

    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();
  });
});

describe('BpcSourcingPanel Location/Space', () => {
  it('shows an owned row resolved location in the Location column instead of "—"', async () => {
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([ownedBlueprint({ item_id: 1, type_id: 870, location_id: 60003760 })])
    );
    loadBlueprintLocation.mockResolvedValue({
      name: 'Jita IV - Moon 4',
      regionId: 10000002,
      space: 'highsec',
    });
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Jita IV - Moon 4')).toBeInTheDocument();
  });

  it('classifies a wormhole-system owned blueprint as wormhole space, and the Space filter can hide it', async () => {
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([
        ownedBlueprint({ item_id: 1, type_id: 870, location_id: 31000007 }),
        ownedBlueprint({ item_id: 2, type_id: 638, location_id: 60003760 }),
      ])
    );
    loadBlueprintLocation.mockImplementation(async (_characterId: number, locationId: number) =>
      locationId === 31000007
        ? { name: 'J105443', regionId: 11000001, space: 'wormhole' as const }
        : { name: 'Jita IV - Moon 4', regionId: 10000002, space: 'highsec' as const }
    );
    const user = userEvent.setup();
    render(<App />);
    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();

    // Space column is hidden by default (issue #796) — toggle it on via the
    // shared column picker before asserting on its text. The menu stays open
    // (multi-select) and Radix marks the rest of the page aria-hidden while
    // it is, so close it first (Characters.tsx's own column-picker tests do
    // the same) before querying anything outside the menu.
    await user.click(await screen.findByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Space' }));
    await user.keyboard('{Escape}');
    expect(within(table).getByText('Wormhole')).toBeInTheDocument();
    expect(within(table).getByText('Highsec')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Wormhole' }));

    expect(within(table).queryByText('Caracal Blueprint')).not.toBeInTheDocument();
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
  });

  it('shows Location/ME/TE/Price by default and can toggle columns via the column picker', async () => {
    loadCharacterBlueprints.mockResolvedValue(
      ownedResult([ownedBlueprint({ item_id: 1, type_id: 870, location_id: 60003760 })])
    );
    // A resolved, real space — the Space filter's chip state is not reset
    // between tests in this file (unlike the Zustand stores `beforeEach`
    // does reset), so a preceding test's narrowed filter can otherwise
    // exclude this fixture's default unresolved (null) space entirely.
    loadBlueprintLocation.mockResolvedValue({
      name: 'Jita IV - Moon 4',
      regionId: 10000002,
      space: 'highsec',
    });
    const user = userEvent.setup();
    render(<App />);
    const table = await screen.findByRole('table', { name: 'BPC Search' });
    await within(table).findByText('Caracal Blueprint');

    for (const name of ['Location', 'ME', 'TE', 'Price']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
    for (const name of ['Source', 'Runs', 'Qty', 'Region', 'Expires']) {
      expect(within(table).queryByRole('columnheader', { name })).not.toBeInTheDocument();
    }

    // Same close-the-menu-before-querying rule the Space test above follows.
    await user.click(await screen.findByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'ME' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Source' }));
    await user.keyboard('{Escape}');

    expect(within(table).queryByRole('columnheader', { name: 'ME' })).not.toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    // Every other default-visible column is untouched.
    expect(within(table).getByRole('columnheader', { name: 'TE' })).toBeInTheDocument();
  });
});

describe('BpcSourcingPanel Source/Space filter collapse (issue #807)', () => {
  /**
   * jsdom's `matchMedia` stub never matches, which `useIsNarrow` reads as a
   * pointer viewport — flip it so the shared `FilterBar` renders its sheet.
   */
  function useNarrowViewport(): () => void {
    const real = window.matchMedia;
    window.matchMedia = (media: string) =>
      ({
        media,
        matches: media === NARROW_QUERY,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    return () => {
      window.matchMedia = real;
    };
  }

  it('collapses Source/Space chips behind the shared filter funnel on a narrow viewport, leaving ColumnPickerMenu in the row', async () => {
    const restore = useNarrowViewport();
    try {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot([row({ contractId: 1, typeId: 638 })])
      );
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole('table', { name: 'BPC Search' });

      expect(screen.queryByRole('button', { name: 'Contracts' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Owned' })).not.toBeInTheDocument();
      // The column picker is a display preference, not a filter — it stays in
      // the row rather than collapsing with Source/Space.
      expect(screen.getByRole('button', { name: 'Columns' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Filters/ }));

      const dialog = screen.getByRole('dialog', { name: 'Filters' });
      expect(within(dialog).getByRole('button', { name: 'Contracts' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Owned' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Highsec' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('applies a Source deselected in the sheet only once Apply is pressed, not before', async () => {
    const restore = useNarrowViewport();
    try {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot([row({ contractId: 1, typeId: 638 })])
      );
      loadCharacterBlueprints.mockResolvedValue(
        ownedResult([ownedBlueprint({ item_id: 1, type_id: 870 })])
      );
      const user = userEvent.setup();
      render(<App />);
      const table = await screen.findByRole('table', { name: 'BPC Search' });
      expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Filters/ }));
      const dialog = screen.getByRole('dialog', { name: 'Filters' });
      await user.click(within(dialog).getByRole('button', { name: 'Owned' }));

      // Still applied against the row behind the modal — the sheet's edit is a draft.
      expect(within(table).getByText('Caracal Blueprint')).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

      expect(within(table).queryByText('Caracal Blueprint')).not.toBeInTheDocument();
      expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('counts a non-default Source or Space as active on the filter trigger', async () => {
    const restore = useNarrowViewport();
    try {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot([row({ contractId: 1, typeId: 638 })])
      );
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole('table', { name: 'BPC Search' });

      expect(screen.queryByRole('button', { name: /^Filters \(/ })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Filters/ }));
      let dialog = screen.getByRole('dialog', { name: 'Filters' });
      await user.click(within(dialog).getByRole('button', { name: 'Owned' }));
      await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

      expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Filters/ }));
      dialog = screen.getByRole('dialog', { name: 'Filters' });
      await user.click(within(dialog).getByRole('button', { name: 'Wormhole' }));
      await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

      expect(screen.getByRole('button', { name: 'Filters (2 active)' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  describe('BPO availability (issue #1241)', () => {
    it('checks no market Order Book while the search is empty', async () => {
      loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([row({ contractId: 1 })]));
      render(<App />);
      await screen.findByRole('table', { name: 'BPC Search' });
      // Past the lookup debounce, so a pending fan-out would have started.
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(getOrderBook).not.toHaveBeenCalled();
    });

    it('highlights a copy whose price is at or above a contract BPO in the same region', async () => {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot(
          [row({ contractId: 1, price: 5_000_000 })],
          [row({ contractId: 2, runs: -1, price: 4_000_000, me: 8, te: 16 })]
        )
      );
      render(<App />);
      const table = await screen.findByRole('table', { name: 'BPC Search' });
      const badge = await within(table).findByRole('button', { name: /BPO on contract: 4M/ });
      expect(badge).toHaveTextContent('BPO may be cheaper');
    });

    it('badges one copy per blueprint, not every offer row, when several are listed', async () => {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot(
          [
            row({ contractId: 1, price: 9_000_000 }),
            row({ contractId: 3, price: 6_000_000 }),
            row({ contractId: 4, typeId: 870, price: 5_000_000 }),
          ],
          [row({ contractId: 2, runs: -1, price: 4_000_000 })]
        )
      );
      render(<App />);
      const table = await screen.findByRole('table', { name: 'BPC Search' });
      await within(table).findByRole('button', { name: /BPO on contract: 4M/ });
      expect(within(table).getAllByRole('button', { name: /BPO on contract/ })).toHaveLength(1);
    });

    it('badges a copy that is on screen even when the cheapest one is past the row cap', async () => {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot(
          // Cheapest last, so it falls past the default 50-row cap.
          Array.from({ length: 60 }, (_, i) =>
            row({ contractId: i + 1, price: (60 - i) * 1_000_000 })
          ),
          [row({ contractId: 999, runs: -1, price: 4_000_000 })]
        )
      );
      render(<App />);
      const table = await screen.findByRole('table', { name: 'BPC Search' });
      await within(table).findByRole('button', { name: /BPO on contract: 4M/ });
      expect(within(table).getAllByRole('button', { name: /BPO on contract/ })).toHaveLength(1);
    });

    it('with one blueprint picked, says BPO once in callout cards rather than on every row', async () => {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot(
          [
            row({ contractId: 1, price: 5_000_000 }),
            row({ contractId: 3, price: 3_000_000, regionId: 10000043 }),
          ],
          [row({ contractId: 2, runs: -1, price: 40_000_000, me: 8, te: 16 })]
        )
      );
      getOrderBook.mockImplementation(async (_regionId, typeId) => ({
        orders: typeId === 638 ? [sellOrder({ price: 2_000_000 })] : [],
        truncated: false,
        fetchedAt: 0,
      }));
      loadContractLocationInfo.mockResolvedValue({ name: 'Jita IV - Moon 4', space: 'highsec' });
      const user = userEvent.setup();
      render(<App />);
      const table = await screen.findByRole('table', { name: 'BPC Search' });

      await user.type(screen.getByPlaceholderText('Search blueprint name…'), 'Rifter');
      await user.click(
        within(screen.getByRole('list', { name: 'Matching blueprints' })).getByRole('button')
      );

      // Inline beside Cheapest by region, one headed group per BPO source.
      expect(await screen.findByText('Market BPOs', { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByText('Contract BPOs', { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByText('Cheapest by region', { selector: 'p' })).toBeInTheDocument();
      // The market book lands after the contract snapshot (debounced lookup).
      const marketList = await screen.findByRole('list', { name: 'Market BPOs' });
      const marketCard = within(marketList).getByRole('listitem');
      const contractCard = within(screen.getByRole('list', { name: 'Contract BPOs' })).getByRole(
        'listitem'
      );
      expect(within(marketCard).getByLabelText('2,000,000.00 ISK')).toBeInTheDocument();
      expect(marketCard).toHaveTextContent('incl. NPC-seeded');
      // System plus its security, never the station or region name.
      await waitFor(() => expect(marketCard).toHaveTextContent('Jita 0.9'));
      expect(marketCard).not.toHaveTextContent('Jita IV - Moon 4');
      expect(marketCard).not.toHaveTextContent('The Forge');
      // 2M is at or below the cheapest copy (3M); 40M is not. Said on the
      // price itself (accent + hint), not as an extra line.
      expect(
        within(marketCard).getByRole('button', { name: 'BPO may be cheaper' })
      ).toBeInTheDocument();
      expect(within(contractCard).getByLabelText('40,000,000.00 ISK')).toBeInTheDocument();
      // The group header names the source: no per-card "BPO" cue line, so
      // the card is as tall as a region card (three lines).
      expect(within(contractCard).queryByText('BPO')).not.toBeInTheDocument();
      expect(contractCard.children).toHaveLength(3);
      // Accent only on the cheapest box in the row: the 2M market BPO beats
      // every copy (3M+) and the 40M contract BPO, so it alone is lit.
      expect(marketCard).toHaveClass('border-accent-dim');
      expect(contractCard).not.toHaveClass('border-accent-dim');
      expect(contractCard).not.toHaveClass('bg-accent/10');
      expect(marketCard.children).toHaveLength(3);
      expect(contractCard).toHaveTextContent('ME 8 / TE 16');
      await waitFor(() => expect(contractCard).toHaveTextContent('Jita 0.9'));
      expect(contractCard).not.toHaveTextContent('Jita IV - Moon 4');
      expect(contractCard).not.toHaveTextContent('The Forge');
      expect(contractCard).not.toHaveTextContent('BPO may be cheaper');

      // Said once, in the cards: no row badge, and no duplicate chip.
      expect(within(table).queryByRole('button', { name: /BPO on/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Cheapest BPO')).not.toBeInTheDocument();
    });

    it('shows a BPO costing more than the copy without the highlight', async () => {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot(
          [row({ contractId: 1, price: 5_000_000 })],
          [row({ contractId: 2, runs: -1, price: 40_000_000 })]
        )
      );
      render(<App />);
      const table = await screen.findByRole('table', { name: 'BPC Search' });
      const badge = await within(table).findByRole('button', { name: /BPO on contract: 40M/ });
      expect(badge).not.toHaveTextContent('BPO may be cheaper');
    });

    it('checks the market for a typed search in the market hub region, badges it, and lists it under Market BPOs', async () => {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot([row({ contractId: 1, typeId: 638, price: 5_000_000 })])
      );
      getOrderBook.mockImplementation(async (_regionId, typeId) => ({
        orders: typeId === 638 ? [sellOrder({ price: 2_000_000 })] : [],
        truncated: false,
        fetchedAt: 0,
      }));
      loadContractLocationInfo.mockResolvedValue({ name: 'Jita IV - Moon 4', space: 'highsec' });
      const user = userEvent.setup();
      render(<App />);
      const table = await screen.findByRole('table', { name: 'BPC Search' });

      await user.type(screen.getByPlaceholderText('Search blueprint name…'), 'Rifter');

      const badge = await within(table).findByRole('button', { name: /BPO on market: 2M/ });
      expect(badge).toHaveTextContent('BPO may be cheaper');
      // "All regions" reads the pilot's market hub (Jita by default) region.
      expect(getOrderBook).toHaveBeenCalledWith(10000002, 638);
      expect(getOrderBook.mock.calls.every(([regionId]) => regionId === 10000002)).toBe(true);
      expect(screen.getByText(/Market BPOs checked in the Jita region/)).toBeInTheDocument();

      expect(within(table).queryByLabelText('2,000,000.00 ISK')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Market BPOs' }));
      // The market row itself: its order price, and its station.
      expect(await within(table).findByLabelText('2,000,000.00 ISK')).toBeInTheDocument();
      expect(within(table).getAllByText('Jita IV - Moon 4').length).toBeGreaterThan(0);
      // The hub's own station is marked (location 60003760 is the Jita hub).
      expect(within(table).getByText('Trade hub')).toBeInTheDocument();
    });

    it("says which market books couldn't be checked, rather than reading a failure as no BPO", async () => {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot([row({ contractId: 1, typeId: 638, price: 5_000_000 })])
      );
      getOrderBook.mockRejectedValue(new Error('420'));
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole('table', { name: 'BPC Search' });

      await user.type(screen.getByPlaceholderText('Search blueprint name…'), 'Rifter');

      expect(
        await screen.findByText(/Couldn't check the market for 1 blueprint/)
      ).toBeInTheDocument();
    });

    it('reads a Global Market Region blueprint from its own region', async () => {
      const GPMR = 19000001;
      loadGlobalMarkets.mockResolvedValue([{ typeId: 638, regionId: GPMR, regionName: 'GPMR-01' }]);
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot([row({ contractId: 1, typeId: 638, price: 5_000_000 })])
      );
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole('table', { name: 'BPC Search' });

      await user.type(screen.getByPlaceholderText('Search blueprint name…'), 'Rifter');

      await waitFor(() => expect(getOrderBook).toHaveBeenCalledWith(GPMR, 638));
      expect(getOrderBook).not.toHaveBeenCalledWith(10000002, 638);
    });

    it('lists contract originals under the Contract BPOs source', async () => {
      loadPublicBpcContracts.mockResolvedValue(
        cachedSnapshot([], [row({ contractId: 2, typeId: 870, runs: -1, price: 40_000_000 })])
      );
      loadCharacterBlueprints.mockResolvedValue(
        ownedResult([ownedBlueprint({ item_id: 1, type_id: 638 })])
      );
      const user = userEvent.setup();
      render(<App />);
      const table = await screen.findByRole('table', { name: 'BPC Search' });
      expect(within(table).queryByText('Caracal Blueprint')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Contract BPOs' }));

      expect(await within(table).findByText('Caracal Blueprint')).toBeInTheDocument();
    });
  });
});
