import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { isSyncConfigured } from '@/app/syncStatus';
import { ContractSearchPanel } from '@/features/contractSearch/ContractSearchPanel';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { PublicContractOffersSnapshot } from '@/features/contractSearch/publicContractOffers';
import type { CachedResult } from '@/esi/cache';
import type { MarketTypeEntry, NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';
import { clearNpcStationIndex } from '@/sde/npcStations';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';
import type { PublicCourierContractsSnapshot } from '@/features/contractSearch/publicCourierContracts';

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

const loadRegionName = vi.fn(async (regionId: number) =>
  regionId === 10000002 ? 'The Forge' : 'Domain'
);
vi.mock('@/features/bpcContracts/regionNames', () => ({
  loadRegionName: (...args: [number]) => loadRegionName(...args),
}));

const CATALOG: MarketTypeEntry[] = [
  { typeId: 34, name: 'Tritanium', marketGroupId: 18 },
  { typeId: 35, name: 'Pyerite', marketGroupId: 18 },
  { typeId: 587, name: 'Rifter', marketGroupId: 61 },
];
const JITA = 60003760;
const AMARR = 60008494;
/** A player structure: `stations.json` does not hold it, so nothing local names it. */
const UNKNOWN_STRUCTURE = 1035466617946;

const STATIONS: NpcStationEntry[] = [
  { id: JITA, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 },
  { id: AMARR, name: 'Amarr VIII (Oris) - Emperor Family Academy', systemId: 30002187 },
];
const SYSTEMS: SolarSystemEntry[] = [
  { id: 30000142, name: 'Jita', security: 0.9, regionId: 10000002 },
  { id: 30002187, name: 'Amarr', security: 1, regionId: 10000043 },
];

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketTypes: vi.fn(async () => CATALOG),
  loadNpcStations: vi.fn(async () => STATIONS),
  loadSolarSystems: vi.fn(async () => SYSTEMS),
}));

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

function cachedCourierSnapshot(
  rows: PublicCourierContractRow[]
): CachedResult<PublicCourierContractsSnapshot> {
  return {
    data: { rows, lastSyncedAt: Date.parse('2026-09-12T18:30:00Z') },
    fetchedAt: new Date(),
    fromCache: false,
    truncated: false,
  };
}

function cachedSnapshot(
  rows: PublicContractOfferRow[]
): CachedResult<PublicContractOffersSnapshot> {
  return {
    data: { rows, lastSyncedAt: Date.parse('2026-09-12T18:30:00Z') },
    fetchedAt: new Date(),
    fromCache: false,
    truncated: false,
  };
}

beforeEach(async () => {
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
  // Both SDE indexes memoize per session, so without this a case that swaps
  // the snapshot reads the previous case's map.
  clearNpcStationIndex();
  clearSolarSystemIndex();
  vi.mocked(isSyncConfigured).mockReturnValue(true);
});

async function bodyRows() {
  const table = await screen.findByRole('table');
  const [, ...rest] = within(table).getAllByRole('rowgroup');
  return within(rest[0]).getAllByRole('row');
}

describe('ContractSearchPanel', () => {
  it('lists every synced offer, any item type, cheapest first', async () => {
    render(<ContractSearchPanel />);

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
    render(<ContractSearchPanel />);

    const rows = await bodyRows();
    expect(rows).toHaveLength(50);
    expect(within(rows[0]).getByText('7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all (61 total)' })).toBeInTheDocument();
  });

  it('names the region each offer sits in', async () => {
    render(<ContractSearchPanel />);

    const rows = await bodyRows();
    expect(within(rows[0]).getByText('Domain')).toBeInTheDocument();
    expect(within(rows[1]).getByText('The Forge')).toBeInTheDocument();
  });

  it("marks an auction's price as a buyout rather than a fixed ask", async () => {
    render(<ContractSearchPanel />);

    const rows = await bodyRows();
    expect(within(rows[2]).getByText('buyout')).toBeInTheDocument();
  });

  it('calls a zero-buyout auction what it is — a starting bid, at its own price', async () => {
    loadPublicContractOffers.mockResolvedValue(
      cachedSnapshot([row({ typeId: 35, isAuction: true, price: 3_000_000, buyout: 0 })])
    );
    render(<ContractSearchPanel />);

    const rows = await bodyRows();
    expect(within(rows[0]).getByText('bid')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('buyout')).not.toBeInTheDocument();
  });

  it('narrows to one item type when a suggestion is picked, and summarises its offers', async () => {
    const user = userEvent.setup();
    render(<ContractSearchPanel />);
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
    render(<ContractSearchPanel />);
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
    render(<ContractSearchPanel />);
    await bodyRows();

    await user.type(screen.getByPlaceholderText('Search item name…'), 'zzzz');

    expect(await screen.findByText('No public contracts match your filters.')).toBeInTheDocument();
  });

  it('shows the not-configured state when the app has no sync backend', async () => {
    vi.mocked(isSyncConfigured).mockReturnValue(false);
    loadPublicContractOffers.mockResolvedValue(null);
    render(<ContractSearchPanel />);

    expect(await screen.findByText("Contract search isn't available")).toBeInTheDocument();
    expect(loadPublicContractOffers).not.toHaveBeenCalled();
  });

  it('distinguishes a configured-but-empty snapshot from a missing backend', async () => {
    loadPublicContractOffers.mockResolvedValue(cachedSnapshot([]));
    render(<ContractSearchPanel />);

    expect(await screen.findByText('No public contracts synced yet')).toBeInTheDocument();
  });
});

describe('ContractSearchPanel — Courier mode', () => {
  async function showCourier() {
    const user = userEvent.setup();
    render(<ContractSearchPanel />);
    await bodyRows();
    await user.click(screen.getByRole('button', { name: 'Courier' }));
    return user;
  }

  it('lists the hauls with both ends named, best-paying first', async () => {
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    expect(within(rows[0]).getByText(/Amarr VIII \(Oris\)/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Jita IV - Moon 4/)).toBeInTheDocument();
    // Region names come from the same lookup the item results use.
    expect(within(rows[1]).getAllByText('The Forge').length).toBeGreaterThan(0);
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
    expect(within(rows[0]).getByText(new RegExp(String(UNKNOWN_STRUCTURE)))).toBeInTheDocument();
  });

  it('says a haul asks for no collateral and states no deadline, rather than showing zeroes', async () => {
    await showCourier();

    const rows = await waitFor(async () => {
      const found = await bodyRows();
      expect(found).toHaveLength(2);
      return found;
    });
    const cells = within(rows[0])
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toContain('—');
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
      expect(within(rows[0]).getByText(/Jita IV - Moon 4/)).toBeInTheDocument();
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
});
