import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { isSyncConfigured } from '@/app/syncStatus';
import { App } from '@/app/App';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { PublicBpcContractsSnapshot } from '@/features/bpcContracts/syncedContracts';
import type { CachedResult } from '@/esi/cache';
import type { BlueprintMap } from '@/sde/types';

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
    ...overrides,
  };
}

function cachedSnapshot(rows: BpcContractRow[]): CachedResult<PublicBpcContractsSnapshot> {
  return {
    data: { rows, lastSyncedAt: Date.parse('2026-09-08T18:30:00Z') },
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
  loadPublicBpcContracts.mockReset();
  loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([]));
  vi.mocked(isSyncConfigured).mockReturnValue(true);

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/industry?tab=sourcing');
});

describe('BpcSourcingPanel', () => {
  it('renders synced BPC rows with item name, ME/TE/runs, price and region', async () => {
    loadPublicBpcContracts.mockResolvedValue(
      cachedSnapshot([row({ contractId: 1, typeId: 638, regionId: 10000002 })])
    );
    render(<App />);

    const table = await screen.findByRole('table', { name: 'BPC Search' });
    expect(within(table).getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(within(table).getByText('The Forge')).toBeInTheDocument();
    expect(within(table).getByText('10')).toBeInTheDocument();
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

  it('still lands on the sourcing tab from the old /bpc-contracts link', async () => {
    loadPublicBpcContracts.mockResolvedValue(cachedSnapshot([row({ contractId: 1, typeId: 638 })]));
    window.history.pushState({}, '', '/bpc-contracts');
    render(<App />);

    const tab = await screen.findByRole('tab', { name: 'BPC Sourcing' });
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
    expect(screen.getByText('Cheapest').parentElement).toHaveTextContent('3,000,000.00');
    expect(screen.getByText('Median').parentElement).toHaveTextContent('5,000,000.00');
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
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('1,000,000.00');
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
