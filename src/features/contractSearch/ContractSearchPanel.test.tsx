import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { isSyncConfigured } from '@/app/syncStatus';
import { clearJumpGraphIndex } from '@/sde/jumpGraph';
import { ContractSearchPanel } from '@/features/contractSearch/ContractSearchPanel';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { ChunkedSnapshotRead } from '@/features/contractSearch/chunkedSnapshot';
import type { CachedResult } from '@/esi/cache';
import type { MarketTypeEntry, NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';
import { clearNpcStationIndex } from '@/sde/npcStations';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';

vi.mock('@/app/syncStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/syncStatus')>();
  return { ...actual, isSyncConfigured: vi.fn(() => true) };
});

const loadPublicContractOffers = vi.fn();
vi.mock('@/features/contractSearch/publicContractOffers', () => ({
  loadPublicContractOffers: (...args: unknown[]) => loadPublicContractOffers(...args),
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
  loadTypeNames: vi.fn(async () => new Map([[34, 'Tritanium']])),
}));

// The whole SDE for these tests: one blueprint (638) printing one product
// (587), so the real `plannableProductTypeID` resolves both menu readings —
// a blueprint row to what it makes, a 587 row to itself.
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
  { typeId: 34, name: 'Tritanium', marketGroupId: 18 },
  { typeId: 35, name: 'Pyerite', marketGroupId: 18 },
  { typeId: 587, name: 'Rifter', marketGroupId: 61 },
];
const JITA = 60003760;
const AMARR = 60008494;
/** A player structure: `stations.json` does not hold it, so nothing local names it. */
const UNKNOWN_STRUCTURE = 1035466617946;
/** A 0.3 system joining the two hubs directly — two jumps instead of four. */
const LOWSEC_SHORTCUT = 30000200;

const STATIONS: NpcStationEntry[] = [
  { id: JITA, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 },
  { id: AMARR, name: 'Amarr VIII (Oris) - Emperor Family Academy', systemId: 30002187 },
];
const SYSTEMS: SolarSystemEntry[] = [
  { id: 30000142, name: 'Jita', security: 0.9, regionId: 10000002 },
  { id: 30002187, name: 'Amarr', security: 1, regionId: 10000043 },
  // Three highsec hops between them, so a route has a length to report.
  { id: 30000144, name: 'Perimeter', security: 0.9, regionId: 10000002 },
  { id: 30000146, name: 'Urlen', security: 0.9, regionId: 10000002 },
  { id: 30002186, name: 'Niarja', security: 0.5, regionId: 10000043 },
  // And one lowsec hop that halves the trip, which is what makes the three
  // route preferences give three different answers rather than one.
  { id: LOWSEC_SHORTCUT, name: 'Ohide', security: 0.3, regionId: 10000043 },
];

/**
 * Jita and Amarr, four jumps apart down a single chain — enough for the
 * courier table's distance and ISK/jump columns to have a real answer, and
 * for the structure-ended haul beside them to have none.
 */
const JUMPS = {
  30000142: [30000144, LOWSEC_SHORTCUT],
  30000144: [30000142, 30000146],
  30000146: [30000144, 30002186],
  30002186: [30000146, 30002187],
  30002187: [30002186, LOWSEC_SHORTCUT],
  [LOWSEC_SHORTCUT]: [30000142, 30002187],
};

/** What `regions.json` ships: the whole k-space table, so nothing asks ESI. */
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

/** Column order: route, reward, collateral, jumps, ISK/jump, ISK/m³, expires. */
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
/** Pays better, asks for no collateral and states no deadline — and ends somewhere nothing local names. */
const AMARR_TO_STRUCTURE = courierRow({
  contractId: 501,
  regionId: 10000043,
  originLocationId: AMARR,
  destinationLocationId: UNKNOWN_STRUCTURE,
  reward: 30_000_000,
  collateral: undefined,
  daysToComplete: undefined,
});

/**
 * What `loadChunkedSnapshot` hands back: the cached rows, plus whether a newer
 * read is running behind them (#963). `revalidating` is false here — the
 * stale-serve path has its own coverage in `chunkedSnapshot.test.ts`.
 */
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
): ChunkedSnapshotRead<PublicCourierContractRow> {
  return snapshotRead(rows);
}

function cachedSnapshot(
  rows: PublicContractOfferRow[],
  overrides: Partial<CachedResult<never>> = {}
): ChunkedSnapshotRead<PublicContractOfferRow> {
  return snapshotRead(rows, overrides);
}

beforeEach(async () => {
  // The jump graph memoizes its index for the session, so without this a
  // later test inherits whichever snapshot an earlier one happened to load.
  clearJumpGraphIndex();
  await db.settings.clear();
  await db.esiCache.clear();
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: true });
  loadPublicContractOffers.mockReset();
  loadPublicContractOffers.mockResolvedValue(
    cachedSnapshot([TRIT_FORGE, TRIT_DOMAIN, PYERITE_AUCTION])
  );
  loadPublicCourierContracts.mockReset();
  loadPublicCourierContracts.mockResolvedValue(
    cachedCourierSnapshot([JITA_TO_AMARR, AMARR_TO_STRUCTURE])
  );
  // Restored per case: one progressive-loading test below holds this pending
  // on purpose, and a leaked never-settling lookup would strand every later
  // case's Region column on its id placeholder.
  loadRegionName.mockReset();
  loadRegionName.mockImplementation(async (regionId: number) =>
    regionId === 10000002 ? 'The Forge' : 'Domain'
  );
  loadContractLocationName.mockReset();
  loadContractLocationName.mockResolvedValue('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
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
  // Both SDE indexes memoize per session, so without this a case that swaps
  // the snapshot reads the previous case's map.
  clearNpcStationIndex();
  clearSolarSystemIndex();
  vi.mocked(isSyncConfigured).mockReturnValue(true);
});

async function bodyRows() {
  const table = await screen.findByRole('table');
  // The name lookups commit a render *after* the rows now (issue #963): the
  // boards no longer wait on the market catalogue, the endpoint resolution or
  // the region names before showing anything. So waiting for the table alone
  // races them, and a cell read straight afterwards can still hold the `#34`
  // placeholder the column honestly shows until its name lands. An empty
  // `waitFor` yields a macrotask inside `act`, which is enough for every
  // already-settled lookup to flush.
  await waitFor(() => {});
  const [, ...rest] = within(table).getAllByRole('rowgroup');
  return within(rest[0]).getAllByRole('row');
}

/**
 * Always inside a Router: every item row is a Build Plan context-menu trigger
 * (#931), as is each detail-modal line, and both call `useNavigate`. Matches
 * production — the panel only ever renders under `/contracts`.
 */
function renderWithRouter() {
  return render(
    <MemoryRouter>
      <ContractSearchPanel />
    </MemoryRouter>
  );
}

describe('ContractSearchPanel', () => {
  it('lists every synced offer, any item type, cheapest first', async () => {
    renderWithRouter();

    const rows = await bodyRows();
    expect(rows).toHaveLength(3);
    // Default sort is price ascending, and an auction is judged on its buyout
    // (2M) rather than its 1 ISK starting bid.
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Tritanium',
      'Tritanium',
      'Pyerite',
    ]);
  });

  it('caps the table at the 50 cheapest offers, not the first 50 the snapshot lists', async () => {
    // Snapshot order is contract-then-type, so the cheapest row can sit well
    // past the cap. Slicing before sorting would show 50 arbitrary rows under
    // a header that claims cheapest-first.
    const dear = Array.from({ length: 60 }, (_, i) =>
      row({ contractId: 100 + i, price: 10_000_000 - i, quantity: 1 })
    );
    const cheapest = row({ contractId: 999, price: 1, quantity: 7 });
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([...dear, cheapest]));
    renderWithRouter();

    const rows = await bodyRows();
    expect(rows).toHaveLength(50);
    expect(within(rows[0]).getByText('7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all (61 total)' })).toBeInTheDocument();
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
  });

  it('shows the not-configured state when the app has no sync backend', async () => {
    vi.mocked(isSyncConfigured).mockReturnValue(false);
    loadPublicContractOffers.mockResolvedValue(null);
    renderWithRouter();

    expect(await screen.findByText("Contract search isn't available")).toBeInTheDocument();
    expect(loadPublicContractOffers).not.toHaveBeenCalled();
  });

  it('distinguishes a configured-but-empty snapshot from a missing backend', async () => {
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([]));
    renderWithRouter();

    expect(await screen.findByText('No public contracts synced yet')).toBeInTheDocument();
  });
});

describe('ContractSearchPanel — contract detail modal', () => {
  it('opens the shared contract detail modal on a row click, the same one BPC Search and Contracts History use', async () => {
    const user = userEvent.setup();
    renderWithRouter();

    const rows = await bodyRows();
    await user.click(rows[0]);

    // rows[0] is Domain-region Tritanium (cheapest-first sort): the modal
    // title is the item name, and its region reflects the clicked row, not
    // whichever row rendered first in the snapshot.
    expect(await screen.findByText('Everything on this contract')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Domain');
    expect(loadPublicContractItems).toHaveBeenCalledWith(TRIT_DOMAIN.contractId);
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
    // The system, not the station it sits in: the full station name belongs
    // to the detail modal, which still shows it.
    expect(within(measurable).getByText(/Jita/)).toBeInTheDocument();
    expect(within(measurable).queryByText(/Jita IV - Moon 4/)).not.toBeInTheDocument();
    // Region names come from the same lookup the item results use.
    expect(within(measurable).getAllByText('The Forge').length).toBeGreaterThan(0);
  });

  it('ranks by ISK per jump, so a haul with no measurable distance sorts last', async () => {
    // The cost of a haul is the trip, and the trip is jumps. A haul with no
    // measurable distance has no rate, and "we cannot say" sorts below every
    // real figure rather than above it — which under the old reward sort is
    // exactly where the richer-looking structure-ended haul did not sit.
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
    // Four jumps the safe way, two through lowsec — and the whole filtered
    // set is re-ranked on the change, not just the visible page.
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
    await userEvent.click(screen.getByRole('option', { name: 'Shortest' }));

    await waitFor(async () => {
      const refreshed = await bodyRows();
      expect(within(refreshed[0]).getAllByRole('cell')[JUMPS_CELL]).toHaveTextContent('2');
    });
  });

  it('ranks by reward and says so when the jump graph cannot be read', async () => {
    // A board that cannot measure distance must not report every haul as
    // having no route; it falls back to reward and states why.
    const { loadSolarSystemJumps } = await import('@/sde/loadMarketSde');
    vi.mocked(loadSolarSystemJumps).mockRejectedValueOnce(new Error('offline'));
    clearJumpGraphIndex();
    await showCourier();

    expect(await screen.findByText(/Jump distances are unavailable right now/)).toBeInTheDocument();
  });

  it('shows what a haul pays per cubic metre, beside the rate it ranks on', async () => {
    // The secondary figure: a hauler filling one hold from several contracts
    // is short of space, not distance. It sits beside ISK/jump rather than
    // replacing it as the sort.
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const cells = within(rows[0])
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    // 12,000,000 ISK over 60,000 m³.
    expect(cells[ISK_PER_VOLUME_CELL]).toBe('200');
  });

  it('has no rate per cubic metre for a haul that states no cargo', async () => {
    // A stated zero survives ingestion — the publisher's parser rejects only
    // an empty column — so this row genuinely reaches the client. It must
    // read as unavailable, never as an infinite rate.
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
    // "0x" is arithmetically true and reads as a measured ratio, which is the
    // opposite of what an absent collateral means — and the Collateral chip
    // beside it already says "none asked" with a dash.
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
    expect(within(dialog).getByText('Collateral / reward').parentElement).toHaveTextContent('—');
  });

  it('has no collateral ratio against a haul that pays nothing', async () => {
    // A free haul carrying collateral is exactly the shape worth showing, so
    // it must render rather than being dropped — but the ratio is unknowable,
    // not infinite.
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
    const ratio = within(dialog).getByText('Collateral / reward').parentElement;
    expect(ratio).toHaveTextContent('—');
    expect(ratio).not.toHaveTextContent('Infinity');
  });

  it('keeps ISK per jump as the default sort, not the new rate', async () => {
    await showCourier();
    await waitFor(async () => {
      expect(await bodyRows()).toHaveLength(2);
    });
    // The header a table sorts by is the one carrying aria-sort.
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
    // 900,000,000 ISK put up against a 12,000,000 ISK reward.
    expect(within(dialog).getByText('Collateral / reward').parentElement).toHaveTextContent('75×');
  });

  it('shows a location nothing local names as its id rather than inventing one', async () => {
    // Resolving a player structure costs one ESI call per id against an ACL
    // that usually refuses, so the panel does not try — see courierEndpoints.ts.
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
    // Asserted by position rather than by counting dashes: the collateral
    // cell specifically must not render "0.00 ISK", which a count would let
    // through as long as some other cell happened to be a dash.
    const cells = within(withoutCollateral)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells[COLLATERAL_CELL]).toBe('—');
    // This haul also ends in a player structure, so it has no distance and no
    // rate — two more dashes, for a different reason.
    expect(cells[JUMPS_CELL]).toBe('—');
    expect(cells[ISK_PER_JUMP_CELL]).toBe('—');
    // The haul that states a collateral shows a figure, not a dash.
    const stated = within(withCollateral)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(stated[COLLATERAL_CELL]).not.toBe('—');
  });

  it('states an absent deadline as unstated in the detail, which is where it lives', async () => {
    // A deadline is a constraint checked once on a haul under consideration,
    // so it is a filter and a detail figure rather than a column.
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
    expect(within(dialog).getByText('Days').parentElement).toHaveTextContent('—');
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
  });

  it('reports an empty courier snapshot on its own terms, not as an empty offers one', async () => {
    loadPublicCourierContracts.mockResolvedValue(cachedCourierSnapshot([]));
    await showCourier();

    expect(await screen.findByText('No public courier contracts synced yet')).toBeInTheDocument();
    // The offers corpus is not empty, and the Items chip is still there to
    // switch back to it.
    expect(screen.getByRole('button', { name: 'Items' })).toBeInTheDocument();
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

    // rows[0] is the best-paying haul (Amarr -> the unnamed structure).
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Amarr VIII (Oris)');
    // No "Everything on this contract" section, and no fetch for one: a
    // courier haul has no item list, unlike the Items-mode modal.
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
  /** Reads where the menu navigated to; `MemoryRouter` never touches `window.location`. */
  function LocationProbe() {
    const { pathname, search } = useLocation();
    return <span data-testid="location">{`${pathname}${search}`}</span>;
  }

  function renderWithProbe() {
    return render(
      <MemoryRouter>
        <ContractSearchPanel />
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

  it("plans the copy a blueprint row names, at that copy's own ME/TE/runs", async () => {
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([BPC_ROW]));
    renderWithProbe();

    const rows = await bodyRows();
    fireEvent.contextMenu(rows[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    // 587 (Rifter), not 638 (its blueprint): `/industry?product=` takes the
    // product, so handing it the blueprint's own typeID creates nothing.
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/industry?product=587&me=10&te=20&runs=5'
      );
    });
  });

  it('plans a plain item row as itself, unseeded', async () => {
    // 587 is directly producible, so the plan targets the row's own item. The
    // regex is anchored on purpose: a non-copy row must carry no me/te/runs,
    // and a substring match would pass with fabricated zeroes appended.
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([row({ contractId: 8, typeId: 587 })])
    );
    renderWithProbe();

    const rows = await bodyRows();
    fireEvent.contextMenu(rows[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/industry\?product=587$/);
    });
  });

  it('offers nothing on a row no blueprint builds', async () => {
    // Asserted by label, not by `aria-disabled`: the transient "checking…"
    // state is disabled too, so the attribute alone passes before the index
    // loads — and Tritanium is neither a blueprint nor a blueprint's product.
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

/**
 * The two corpora used to arrive out of one loader, so neither board rendered
 * until both had landed — a hauler waited on ~370k item-offer rows to be shown
 * ~620 hauls (issue #963). These cases hold each board's independence, and
 * hold the line that a board mid-load must not read as a finished one.
 */
describe('ContractSearchPanel — progressive loading', () => {
  /** A loader the test decides when, and whether, to settle. */
  function deferred<T>() {
    let settle!: (value: T) => void;
    const promise = new Promise<T>((resolve) => {
      settle = resolve;
    });
    return { promise, settle };
  }

  it('renders the courier board while the offers snapshot is still in flight', async () => {
    const offers = deferred<ChunkedSnapshotRead<PublicContractOfferRow>>();
    loadPublicContractOffers.mockReturnValue(offers.promise);
    const user = userEvent.setup();
    renderWithRouter();

    await user.click(screen.getByRole('button', { name: 'Courier' }));

    const table = await screen.findByRole('table');
    const [, ...rest] = within(table).getAllByRole('rowgroup');
    expect(within(rest[0]).getAllByRole('row')).toHaveLength(2);
    // Still pending — the hauls above did not wait for it.
    offers.settle(cachedSnapshot([TRIT_FORGE]));
  });

  it('renders the item board while the courier snapshot is still in flight', async () => {
    const courier = deferred<ChunkedSnapshotRead<PublicCourierContractRow>>();
    loadPublicCourierContracts.mockReturnValue(courier.promise);
    renderWithRouter();

    expect(await bodyRows()).toHaveLength(3);
    courier.settle(cachedCourierSnapshot([JITA_TO_AMARR]));
  });

  it('says which corpus it is loading rather than showing a bare spinner', async () => {
    const offers = deferred<ChunkedSnapshotRead<PublicContractOfferRow>>();
    loadPublicContractOffers.mockReturnValue(offers.promise);
    renderWithRouter();

    expect(
      await screen.findByRole('status', { name: 'Loading public contracts…' })
    ).toBeInTheDocument();
    offers.settle(cachedSnapshot([TRIT_FORGE]));
  });

  it('never claims an empty corpus while that corpus is still loading', async () => {
    // The whole point: "no contracts have synced" and "they have not arrived
    // yet" are different answers, and the second must not be given as the first.
    const offers = deferred<ChunkedSnapshotRead<PublicContractOfferRow>>();
    loadPublicContractOffers.mockReturnValue(offers.promise);
    renderWithRouter();

    await screen.findByRole('status', { name: 'Loading public contracts…' });
    expect(screen.queryByText('No public contracts synced yet')).not.toBeInTheDocument();

    offers.settle(cachedSnapshot([]));
    expect(await screen.findByText('No public contracts synced yet')).toBeInTheDocument();
  });

  it('names regions out of the local SDE, not one ESI call per region', async () => {
    // `public/data/market/regions.json` is 78 entries and 2.7 KB; the ESI
    // lookup it replaces was a round-trip per distinct region on a cold cache,
    // and the only network-bound name stage of the whole load.
    renderWithRouter();

    const rows = await bodyRows();
    expect(within(rows[0]).getByText('Domain')).toBeInTheDocument();
    expect(loadRegionName).not.toHaveBeenCalled();
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
