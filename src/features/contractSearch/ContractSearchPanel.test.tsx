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
import type { MarketTypeEntry } from '@/sde/marketTypes';

vi.mock('@/app/syncStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/syncStatus')>();
  return { ...actual, isSyncConfigured: vi.fn(() => true) };
});

const loadPublicContractOffers = vi.fn();
vi.mock('@/features/contractSearch/publicContractOffers', () => ({
  loadPublicContractOffers: (...args: unknown[]) => loadPublicContractOffers(...args),
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
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketTypes: vi.fn(async () => CATALOG),
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
