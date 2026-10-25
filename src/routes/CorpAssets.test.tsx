import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { CachedResult, StatusResult } from '@/esi/cache';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import {
  useCorpAccess,
  type CorpAccess,
  type CorpAccessState,
} from '@/features/corp/useCorpAccess';
import type { CorporationAsset, CorporationDivisions } from '@/esi/endpoints';
import * as boardData from '@/features/corp/boardData';
import * as corpAssets from '@/features/corp/assets';
import * as corpWallet from '@/features/corp/wallet';
import * as stockTargets from '@/features/corp/stockTargets';
import { db } from '@/db';
import { CorpAssets } from './CorpAssets';
import { LocationProbe } from '@/test/LocationProbe';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mock('@/features/corp/boardData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/boardData')>()),
  loadCorporationId: vi.fn(),
}));
vi.mock('@/features/corp/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/assets')>()),
  loadCorporationAssets: vi.fn(),
  loadCorpAssetLabels: vi.fn(),
  resolveMissingLocationNames: vi.fn(),
}));
// Show info's modal fetches the type's dogma/market data; a stub that names
// its item is all the name-button tests need to see it opened.
vi.mock('@/features/market/ItemDetailModal', () => ({
  ItemDetailModal: ({ itemName }: { itemName: string }) => (
    <div role="dialog" aria-label={`Item detail: ${itemName}`} />
  ),
}));
const ABYSSAL_NEUT = vi.hoisted(() => 47832);
vi.mock('@/sde/loadSde', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/loadSde')>()),
  loadBlueprints: vi.fn(async () => ({})),
  loadTypes: vi.fn(async () => ({})),
  loadGroupCategories: vi.fn(async () => ({})),
  loadMutaplasmids: vi.fn(async () => ({
    attributeNames: {},
    mutaplasmids: {},
    abyssalTypeIds: [ABYSSAL_NEUT],
  })),
}));
// Copy valuation reaches Firestore; these tests only need a copy's badge.
vi.mock('@/features/assets/assetCopyValues', () => ({
  loadAssetCopyValues: vi.fn(async () => new Map()),
}));
// Stock targets live in a synced setting; the page only needs the hook's shape.
vi.mock('@/features/corp/stockTargets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/stockTargets')>()),
  useCorpStockTargets: vi.fn(),
}));
// The market catalogue is a lazy download; the Group column only needs its answer.
vi.mock('@/features/corp/assetCategories', () => ({
  loadTypeCategories: vi.fn(async () => new Map()),
}));
// Names for a targeted type the corporation owns none of come from the SDE/ESI resolver.
vi.mock('@/features/character/typeNames', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/typeNames')>()),
  loadTypeNames: vi.fn(
    async (ids: readonly number[]) => new Map(ids.map((id) => [id, `Name ${id}`]))
  ),
  loadTypePackagedVolumes: vi.fn(async () => new Map()),
}));
// The Move tab reads ship data, the pilot's skills and place names; this file only opens it.
vi.mock('@/features/fittings/useFittingCatalogue', () => ({
  useFittingCatalogue: () => null,
  useFittingCatalogueFailed: () => false,
}));
vi.mock('@/features/fittings/fittingPilotProfile', () => ({
  usePilotProfile: () => ({ profile: null, failed: false, skillsKnown: true, retry: () => {} }),
}));
vi.mock('@/features/places', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/places')>()),
  resolvePlace: vi.fn(async () => ({ name: 'Jita IV - Moon 4', systemId: 30000142 })),
}));
vi.mock('@/features/corp/wallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/wallet')>()),
  loadCorporationDivisions: vi.fn(),
}));

const mockedAccess = vi.mocked(useCorpAccess);
const mocked = { ...vi.mocked(boardData), ...vi.mocked(corpAssets), ...vi.mocked(corpWallet) };

const CHARACTER_ID = 42;
const CORPORATION_ID = 98000001;
const NOW = Date.parse('2026-09-03T12:00:00Z');

function accessOf(state: CorpAccessState, capabilities: Partial<CorpCapabilities>): CorpAccess {
  return {
    state,
    capabilities: { ...NO_CORP_CAPABILITIES, ...capabilities },
    missingScopes: [],
    roles: [],
    readFailed: false,
    retry: () => {},
  };
}

function cached<T>(data: T, overrides: Partial<CachedResult<T>> = {}): StatusResult<T> {
  const result: CachedResult<T> = {
    data,
    fetchedAt: new Date(NOW - 30 * 60_000),
    fromCache: false,
    truncated: false,
    ...overrides,
  };
  return { cached: result, needsReauth: false };
}

const READ_FAILED: StatusResult<never> = { cached: null, needsReauth: false };

function asset(overrides: Partial<CorporationAsset> & { item_id: number }): CorporationAsset {
  return {
    type_id: 34,
    quantity: 1,
    location_id: 60003760,
    location_type: 'other',
    location_flag: 'CorpSAG1',
    is_singleton: false,
    ...overrides,
  };
}

const OFFICE = 60003760;
const EMPTY_OFFICE = 60008494;

/** An office with stock in two divisions, a delivery, a copy, an impounded hull, and a second, empty office. */
function ledgerFixture(): CorporationAsset[] {
  return [
    asset({
      item_id: 100,
      type_id: 27,
      location_id: OFFICE,
      location_type: 'station',
      location_flag: 'OfficeFolder',
    }),
    asset({
      item_id: 101,
      type_id: 27,
      location_id: EMPTY_OFFICE,
      location_type: 'station',
      location_flag: 'OfficeFolder',
    }),
    asset({
      item_id: 1,
      type_id: 34,
      quantity: 5000,
      location_id: 100,
      location_type: 'item',
      location_flag: 'CorpSAG1',
    }),
    asset({
      item_id: 2,
      type_id: 35,
      quantity: 10,
      location_id: 100,
      location_type: 'item',
      location_flag: 'CorpSAG3',
    }),
    asset({
      item_id: 3,
      type_id: 34,
      quantity: 200,
      location_id: 100,
      location_type: 'item',
      location_flag: 'CorpDeliveries',
    }),
    asset({
      item_id: 4,
      type_id: 587,
      location_id: OFFICE,
      location_type: 'station',
      location_flag: 'Impounded',
      is_singleton: true,
    }),
    asset({
      item_id: 5,
      type_id: 691,
      location_id: 100,
      location_type: 'item',
      location_flag: 'CorpSAG1',
      is_blueprint_copy: true,
    }),
  ];
}

const setTarget = vi.fn();
const removeTarget = vi.fn();

function useTargets(targets: [number, number][] = []) {
  const map = new Map(targets);
  vi.mocked(stockTargets.useCorpStockTargets).mockReturnValue({
    hydrated: true,
    targets: map,
    setTarget,
    removeTarget,
  });
}

function renderAssets(initialEntry = '/corp/assets') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/corp/assets" element={<CorpAssets />} />
        <Route path="/corp/assets/*" element={<CorpAssets />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

function currentLocation(): string {
  return screen.getByTestId('location').textContent ?? '';
}

/** Longer than the global async timeout: the page chains several mocked loads before it renders. */
async function ledger(entry = '/corp/assets') {
  renderAssets(entry);
  return screen.findByRole('tablist', { name: 'Asset state' }, { timeout: 10000 });
}

/** The item names in table order (first cell of each body row). */
function itemOrder(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent ?? '')
    .filter(Boolean);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
  useTargets();

  mocked.loadCorporationId.mockResolvedValue(CORPORATION_ID);
  mocked.loadCorporationAssets.mockResolvedValue(cached(ledgerFixture()));
  mocked.loadCorporationDivisions.mockResolvedValue(
    cached<CorporationDivisions>({ hangar: [{ division: 1, name: 'Ships' }] })
  );
  mocked.loadCorpAssetLabels.mockResolvedValue({
    types: new Map([
      [34, 'Tritanium'],
      [35, 'Pyerite'],
      [587, 'Rifter'],
      [691, 'Rifter Blueprint'],
      [27, 'Office'],
    ]),
    locations: new Map([
      [OFFICE, 'Jita IV - Moon 4'],
      [EMPTY_OFFICE, 'Amarr VIII - Emperor Family Academy'],
    ]),
  });
  mocked.resolveMissingLocationNames.mockResolvedValue(new Map());
  mockedAccess.mockReturnValue(accessOf('ready', { canReadAssets: true }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('access', () => {
  it('waits rather than deciding while corp access is still resolving', () => {
    mockedAccess.mockReturnValue(accessOf('unknown', {}));
    renderAssets();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(mocked.loadCorporationAssets).not.toHaveBeenCalled();
  });

  it('renders nothing but the reason for a ready character without the assets capability', async () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
    renderAssets();
    expect(await screen.findByText('Corp assets need Director')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(mocked.loadCorporationAssets).not.toHaveBeenCalled();
  });

  it('renders the reason for a character with no corp access at all', async () => {
    mockedAccess.mockReturnValue(accessOf('none', {}));
    renderAssets();
    expect(await screen.findByText('Corp assets need Director')).toBeInTheDocument();
  });

  it('fetches nothing when the corporation is not known yet', async () => {
    mocked.loadCorporationId.mockResolvedValue(null);
    renderAssets();
    await waitFor(() => expect(mocked.loadCorporationId).toHaveBeenCalled());
    expect(mocked.loadCorporationAssets).not.toHaveBeenCalled();
  });
});

describe('state tabs', () => {
  it('counts stacks per tab and hides the tabs that hold nothing', async () => {
    await ledger();
    expect(screen.getByRole('tab', { name: 'All 5' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Offices 3' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Corp deliveries 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Impounded 1' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^In space/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Asset safety/ })).not.toBeInTheDocument();
  });

  it('keeps All and Offices even when the corporation has no offices', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(
      cached([asset({ item_id: 4, type_id: 587, location_flag: 'Impounded' })])
    );
    await ledger();
    expect(screen.getByRole('tab', { name: 'Offices 0' })).toBeInTheDocument();
  });

  it('puts the tab in the path and keeps the query when switching', async () => {
    const user = userEvent.setup();
    await ledger('/corp/assets?q=r');
    await user.click(screen.getByRole('tab', { name: 'Impounded 1' }));
    expect(currentLocation()).toBe('/corp/assets/impounded?q=r');
    expect(await screen.findByText('Rifter')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('opens a tab straight from its path', async () => {
    await ledger('/corp/assets/deliveries');
    expect(
      screen.getByRole('tab', { name: 'Corp deliveries 1', selected: true })
    ).toBeInTheDocument();
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });

  it('opens Move from /corp/assets/move with the corporation hangar stock, and leaves the ledger links alone', async () => {
    const user = userEvent.setup();
    await ledger('/corp/assets/move?q=r');
    expect(screen.getByRole('tab', { name: 'Move', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Corporation hangars')).toBeInTheDocument();
    // The stock, not the impounded hull or the delivery.
    expect(
      screen.getByRole('checkbox', { name: /select everything at .* for Corporation hangars/i })
    ).toBeInTheDocument();
    expect(screen.queryByText('Name 587')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^All/ }));
    expect(currentLocation()).toBe('/corp/assets?q=r');
  });

  it('sends an old tree deep link to /corp/assets, keeping the query', async () => {
    renderAssets('/corp/assets/1/i:999?q=tri');
    await waitFor(() => expect(currentLocation()).toBe('/corp/assets?q=tri'));
    expect(await screen.findByRole('tablist', { name: 'Asset state' })).toBeInTheDocument();
  });
});

describe('group by item', () => {
  it('lists one row per item type, with a blueprint copy as its own badged row', async () => {
    await ledger();
    // A plain name, not a Show info link: the row expands in place (DESIGN.md §6c).
    expect(await screen.findByText('Tritanium')).not.toHaveAttribute('href');
    expect(screen.getAllByText('Tritanium')).toHaveLength(1);
    expect(screen.getByText('Blueprint copy').parentElement).toHaveTextContent('BPC');
    expect(screen.getByText('5,200')).toBeInTheDocument();
  });

  it('names where an item sits, with the corp’s division names', async () => {
    await ledger();
    expect(await screen.findByText('Jita IV · Ships ×5,000')).toBeInTheDocument();
    expect(screen.getByText('Jita IV · Corp deliveries ×200')).toBeInTheDocument();
    expect(screen.getByText('Jita IV · Impounded ×1')).toBeInTheDocument();
  });

  it('sorts by any column from its header, writing the sort to the query', async () => {
    const user = userEvent.setup();
    await ledger();
    await screen.findByText('Pyerite');
    await user.click(screen.getByRole('button', { name: /^Qty/ }));
    await waitFor(() => expect(currentLocation()).toContain('sort=quantity'));
    const rows = itemOrder();
    expect(rows.findIndex((r) => r.includes('Pyerite'))).toBeLessThan(
      rows.findIndex((r) => r.includes('Tritanium'))
    );
  });

  it('adds a column from the column picker', async () => {
    const user = userEvent.setup();
    await ledger();
    await screen.findByText('Pyerite');
    expect(screen.queryByRole('button', { name: /^Volume/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Volume' }));
    // The open menu hides the page from the accessibility tree.
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('button', { name: /^Volume/ })).toBeInTheDocument();
  });

  it('opens a row to list its stacks with their full path', async () => {
    const user = userEvent.setup();
    await ledger();
    await user.click(await screen.findByText('5,200'));
    expect(await screen.findByText(/Jita IV - Moon 4 › Ships/)).toBeInTheDocument();
    expect(screen.getByText(/Jita IV - Moon 4 › Corp deliveries/)).toBeInTheDocument();
  });

  it('searches by item name and keeps the search in the query', async () => {
    const user = userEvent.setup();
    await ledger();
    await user.type(screen.getByPlaceholderText('Search items…'), 'pyer');
    await waitFor(() => expect(currentLocation()).toBe('/corp/assets?q=pyer'));
    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });

  it('applies ?q= on arrival', async () => {
    await ledger('/corp/assets?q=tri');
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search items…')).toHaveValue('tri');
  });

  it('filters by location and division from the query', async () => {
    await ledger('/corp/assets?loc=60003760&div=3');
    expect(await screen.findByText('Pyerite')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('shows an empty state when the filters leave nothing', async () => {
    await ledger('/corp/assets?q=zzz');
    expect(await screen.findByText('Nothing matches')).toBeInTheDocument();
  });
});

describe('stock targets', () => {
  it('sets a target from the Target cell', async () => {
    const user = userEvent.setup();
    await ledger();
    await user.click(await screen.findByRole('button', { name: 'Set a stock target for Pyerite' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Target for Pyerite' }), '50{Enter}');
    expect(setTarget).toHaveBeenCalledWith(35, 50);
  });

  it('shows how far short a target is, and flags a type with none owned', async () => {
    useTargets([
      [35, 50],
      [999, 5],
    ]);
    await ledger();
    expect(await screen.findByText('40')).toBeInTheDocument();
    expect(screen.getByText('none owned')).toBeInTheDocument();
  });

  it('narrows to the types below target and sorts the biggest shortfall first', async () => {
    const user = userEvent.setup();
    useTargets([[35, 50]]);
    await ledger();
    await screen.findByText('Tritanium');
    await user.click(screen.getByRole('button', { name: /Below target/ }));
    await waitFor(() => expect(currentLocation()).toBe('/corp/assets?below=1'));
    await waitFor(() => expect(screen.queryByText('Tritanium')).not.toBeInTheDocument());
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });

  it('names a targeted type the corporation owns none of, and finds it by search', async () => {
    useTargets([[4242, 7]]);
    await ledger('/corp/assets?q=name 4242');
    expect(await screen.findByText('Name 4242')).toBeInTheDocument();
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('opens the Stock targets dialog', async () => {
    const user = userEvent.setup();
    await ledger();
    await user.click(screen.getByRole('button', { name: 'Stock targets…' }));
    expect(await screen.findByRole('dialog', { name: 'Stock targets' })).toBeInTheDocument();
  });
});

describe('group by location', () => {
  it('groups divisions under their office and flags an empty office', async () => {
    const user = userEvent.setup();
    await ledger();
    await user.click(screen.getByRole('button', { name: 'Location' }));
    await waitFor(() => expect(currentLocation()).toBe('/corp/assets?group=location'));
    expect(await screen.findByText('Amarr VIII - Emperor Family Academy')).toBeInTheDocument();
    expect(screen.getByText('Empty office')).toBeInTheDocument();
    expect(screen.getByText('Jita IV - Moon 4')).toBeInTheDocument();
    expect(screen.getAllByText('Ships').length).toBeGreaterThan(0);
  });

  it('opens the by-item view for a clicked division, dropping group', async () => {
    const user = userEvent.setup();
    await ledger('/corp/assets?group=location');
    await user.click((await screen.findAllByText('Ships'))[0]);
    await waitFor(() => expect(currentLocation()).toBe('/corp/assets?loc=60003760&div=1'));
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument();
  });

  it('lists only the divisions in use, with a count, and folds an empty office', async () => {
    await ledger('/corp/assets?group=location');
    expect(await screen.findByText('Empty office')).toBeInTheDocument();
    expect(screen.getAllByText('2 of 7 divisions in use').length).toBeGreaterThan(0);
    expect(screen.queryByText('Division 4')).not.toBeInTheDocument();
    // The empty office is folded: its placeholder row is not mounted.
    expect(screen.queryByText('Nothing stored here')).not.toBeInTheDocument();
  });

  it('keeps Corp deliveries after the divisions, however the table is sorted', async () => {
    const user = userEvent.setup();
    await ledger('/corp/assets?group=location&lsort=items:asc');
    await screen.findByText('Empty office');
    const order = () => itemOrder().filter((r) => /Ships|Division 3|Corp deliveries/.test(r));
    expect(order().at(-1)).toContain('Corp deliveries');
    await user.click(screen.getAllByRole('button', { name: /^Items/ })[0]);
    expect(order().at(-1)).toContain('Corp deliveries');
  });

  it('hides every group with no match under a filter, empty offices included', async () => {
    await ledger('/corp/assets?group=location&q=zzz');
    expect(await screen.findByText('Nothing matches')).toBeInTheDocument();
    // A filter hides every group with no matching row, empty offices included.
    expect(screen.queryByText('Empty office')).not.toBeInTheDocument();
    expect(screen.queryByText('Jita IV - Moon 4')).not.toBeInTheDocument();
  });

  it('lists non-office places as their own groups on All', async () => {
    await ledger('/corp/assets?group=location');
    expect(await screen.findByText('Jita IV · Impounded')).toBeInTheDocument();
  });
});

describe('the cached data notice', () => {
  it('says nothing while every read is fresh', async () => {
    await ledger();
    expect(screen.queryByText('Showing cached data')).not.toBeInTheDocument();
  });

  it('shows it, aged, when the read is the saved copy', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(
      cached(ledgerFixture(), { fromCache: true, fetchedAt: new Date(NOW - 3 * 3_600_000) })
    );
    await ledger();
    expect(await screen.findByText('Showing cached data')).toBeInTheDocument();
  });
});

describe('truncation', () => {
  it('surfaces truncation with the count fetched', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(cached(ledgerFixture(), { truncated: true }));
    await ledger();
    expect(await screen.findByText(/Only the first 7 assets were fetched/)).toBeInTheDocument();
  });
});

describe('failed vs. genuinely empty reads', () => {
  it('shows a load-failed state rather than an empty corporation when the read failed', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(READ_FAILED);
    renderAssets();
    expect(await screen.findByText('Could not load corp assets')).toBeInTheDocument();
  });

  it('shows the empty state when the corporation genuinely owns nothing', async () => {
    mocked.loadCorporationAssets.mockResolvedValue(cached([]));
    renderAssets();
    expect(await screen.findByText('No corporation assets')).toBeInTheDocument();
  });
});

describe('row actions', () => {
  it('opens the item menu from a visible More actions button', async () => {
    const user = userEvent.setup();
    await ledger();
    await screen.findByText('Pyerite');
    await user.click(screen.getByRole('button', { name: 'More actions for Pyerite' }));
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Set stock target/ })).toBeInTheDocument();
    for (const name of ['Copy name', 'Add to Quickbar', 'Add to Compare', 'No blueprint options']) {
      expect(screen.queryByRole('menuitem', { name })).not.toBeInTheDocument();
    }
  });

  it('adds every selected item but a Mutated module to the Quickbar', async () => {
    await db.quickbars.clear();
    mocked.loadCorporationAssets.mockResolvedValue(
      cached([
        asset({ item_id: 1, type_id: 34 }),
        asset({ item_id: 2, type_id: 35 }),
        asset({ item_id: 3, type_id: ABYSSAL_NEUT, is_singleton: true }),
      ])
    );
    mocked.loadCorpAssetLabels.mockResolvedValue({
      types: new Map([
        [34, 'Tritanium'],
        [35, 'Pyerite'],
        [ABYSSAL_NEUT, 'Heavy Abyssal Energy Neutralizer'],
      ]),
      locations: new Map(),
    });
    const user = userEvent.setup();
    await ledger();
    await screen.findByText('Heavy Abyssal Energy Neutralizer');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Tritanium' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Pyerite' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Heavy Abyssal Energy Neutralizer' })
    );
    await user.click(screen.getByRole('button', { name: 'Add to Quickbar' }));

    await waitFor(async () => {
      const record = await db.quickbars.get(String(CHARACTER_ID));
      expect(record?.items).toEqual([
        { typeId: 34, name: 'Tritanium' },
        { typeId: 35, name: 'Pyerite' },
      ]);
    });
  });

  it('paints the ledger before place names resolve, then fills them in', async () => {
    mocked.loadCorpAssetLabels.mockResolvedValue({
      types: new Map([
        [34, 'Tritanium'],
        [35, 'Pyerite'],
        [587, 'Rifter'],
        [691, 'Rifter Blueprint'],
        [27, 'Office'],
      ]),
      locations: new Map(),
    });
    let resolvePlaces: (names: Map<number, string>) => void = () => {};
    mocked.resolveMissingLocationNames.mockReturnValue(
      new Promise((resolve) => {
        resolvePlaces = resolve;
      })
    );

    await ledger('/corp/assets?group=location');
    expect(screen.queryByText('Jita IV - Moon 4')).not.toBeInTheDocument();

    resolvePlaces(new Map([[OFFICE, 'Jita IV - Moon 4']]));
    expect(await screen.findByText('Jita IV - Moon 4')).toBeInTheDocument();
  });
});
