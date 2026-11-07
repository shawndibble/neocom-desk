import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import '@/i18n';
import { db } from '@/db';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import type { CharacterFitting } from '@/esi/endpoints';
import { FittingStartScreen } from './FittingStartScreen';
import type { FittingLibrarySource } from './useFittingPicker';

const useEndpointsGrantedMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/useGrantedScopes', () => ({ useEndpointsGranted: useEndpointsGrantedMock }));
const loadInGameFittingsMock = vi.hoisted(() => vi.fn());
vi.mock('./inGameFittings', () => ({ loadInGameFittings: loadInGameFittingsMock }));
vi.mock('./popularFits', () => ({ usePopularFits: () => ({ ok: true, fits: [] }) }));
const loadCharacterShipMock = vi.hoisted(() => vi.fn());
const shipTypeIdMock = vi.hoisted(() =>
  vi.fn((): { typeId: number | null; status: string } => ({ typeId: null, status: 'needsScope' }))
);
vi.mock('@/features/character/ship', () => ({
  loadCharacterShip: loadCharacterShipMock,
  useCharacterShipTypeId: shipTypeIdMock,
}));
const loadCharacterAssetsMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/assets/assets', () => ({ loadCharacterAssets: loadCharacterAssetsMock }));
// The asset-to-Fitting mapping has its own tests; here only which items reach it matters.
const shipItemsToFittingMock = vi.hoisted(() =>
  vi.fn(async (ship: { typeId: number; name: string }) => ({
    name: ship.name,
    shipTypeId: ship.typeId,
    modules: [],
    drones: [],
    cargo: [],
  }))
);
vi.mock('./assetShipLocation', () => ({ shipItemsToFitting: shipItemsToFittingMock }));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({
    '587': { name: 'Rifter', groupID: 25 },
    '24698': { name: 'Drake', groupID: 419 },
    '670': { name: 'Capsule', groupID: 29 },
  })),
  loadTypeEffects: vi.fn(async () => ({})),
}));
// The preview's numbers are the compare hooks' job; here it only proves which row is picked.
vi.mock('./FittingPreview', () => ({
  FittingPreview: ({
    row,
    onOpen,
    onCompare,
    onSaveNotes,
  }: {
    row: { name: string };
    onOpen: () => void;
    onCompare: (code: string) => void;
    onSaveNotes: (notes: string) => void;
  }) => (
    <div>
      <p>preview of {row.name}</p>
      <button onClick={() => onSaveNotes('Kite first.')}>Save notes</button>
      <button onClick={onOpen}>Open fitting</button>
      <button onClick={() => onCompare('1.abc')}>Compare</button>
    </div>
  ),
}));

vi.mock('@/sync', () => ({ scheduleSync: vi.fn(), markFittingDeleted: vi.fn() }));

const isPhoneMock = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: isPhoneMock }));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}));

const RIFTER: Fitting = {
  name: 'Kite',
  shipTypeId: 587,
  modules: [],
  drones: [],
  cargo: [],
};

function inGameFitting(overrides: Partial<CharacterFitting> = {}): CharacterFitting {
  return {
    fitting_id: 1,
    name: 'PvP Rifter',
    description: '',
    ship_type_id: 587,
    items: [{ flag: 'HiSlot0', quantity: 1, type_id: 484 }],
    ...overrides,
  };
}

function makeWorkspace(): FittingLibrarySource {
  return {
    lastLoad: null,
    shareError: null,
    tooLargeToShare: false,
    loadFromInput: vi.fn(),
    loadFittingXmlDocument: vi.fn(),
    openLoaded: vi.fn().mockResolvedValue(undefined),
    openSaved: vi.fn(),
  };
}

function renderDialog(
  props: Partial<ComponentProps<typeof FittingStartScreen>> = {},
  workspace = makeWorkspace()
) {
  const onOpened = vi.fn();
  render(
    <MemoryRouter>
      <FittingStartScreen
        variant="dialog"
        workspace={workspace}
        catalogue={null}
        characterId={7}
        inGameKey={0}
        onOpened={onOpened}
        {...props}
      />
    </MemoryRouter>
  );
  return { workspace, onOpened };
}

/** A `path` starts the router there (`useNavigate` is mocked, so it never moves). */
function renderScreen(
  workspace = makeWorkspace(),
  onStartHull = vi.fn(),
  pageTitle?: string,
  path?: string
) {
  render(
    <MemoryRouter initialEntries={[path ?? '/']}>
      <FittingStartScreen
        workspace={workspace}
        catalogue={null}
        characterId={7}
        inGameKey={0}
        onStartHull={onStartHull}
        pageTitle={pageTitle}
      />
    </MemoryRouter>
  );
  return workspace;
}

beforeEach(async () => {
  vi.clearAllMocks();
  isPhoneMock.mockReturnValue(false);
  await db.fittings.clear();
  useEndpointsGrantedMock.mockReturnValue(true);
  shipTypeIdMock.mockReturnValue({ typeId: null, status: 'needsScope' });
  loadCharacterShipMock.mockResolvedValue(null);
  loadCharacterAssetsMock.mockResolvedValue({ cached: { data: [] }, needsReauth: false });
  const encoded = await encodeFittingShare(fittingToShareInput(RIFTER));
  if (!encoded.ok) throw new Error('encode failed');
  await db.fittings.add({
    id: 'r1',
    characterId: 7,
    name: 'Kite',
    code: encoded.payload,
    updatedAt: 1,
  });
  loadInGameFittingsMock.mockResolvedValue({
    cached: {
      data: [
        inGameFitting(),
        inGameFitting({ fitting_id: 2, name: 'Armor Drake', ship_type_id: 24698 }),
      ],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    },
    needsReauth: false,
  });
});

describe('FittingStartScreen', () => {
  it('puts the In-game refresh in the page header, beside the title, not in the search row', async () => {
    renderScreen(makeWorkspace(), vi.fn(), 'Fittings');

    const refresh = await screen.findByRole('button', { name: /refresh/i }, { timeout: 5000 });
    const header = screen.getByRole('heading', { level: 1, name: 'Fittings' }).closest('header');
    expect(header).toContainElement(refresh);
  });

  it('lists saved and In-game fittings together under their hull', async () => {
    renderScreen();

    const list = await screen.findByRole(
      'navigation',
      { name: 'Your fittings' },
      { timeout: 5000 }
    );
    const rifter = (
      await within(list).findByRole('heading', { name: 'Rifter' }, { timeout: 5000 })
    ).closest('section') as HTMLElement;
    // The saved and in-game rows resolve their hull names independently and
    // asynchronously — the heading can land before either row does.
    expect(await within(rifter).findByText('Kite', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(
      await within(rifter).findByText('PvP Rifter', {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(await within(list).findByText('Armor Drake', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('one search covers name and hull across both sources', async () => {
    renderScreen();
    await screen.findByText('Armor Drake');
    const search = screen.getByRole('searchbox', { name: 'Search fittings' });

    await userEvent.type(search, 'kite');
    expect(screen.getByText('Kite')).toBeInTheDocument();
    expect(screen.queryByText('PvP Rifter')).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'rifter');
    expect(screen.getByText('Kite')).toBeInTheDocument();
    expect(screen.getByText('PvP Rifter')).toBeInTheDocument();
    expect(screen.queryByText('Armor Drake')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 matching fittings');
  });

  it('keeps the search in the URL as ?q=, so Back from an opened fitting finds it searched', async () => {
    renderScreen(makeWorkspace(), vi.fn(), undefined, '/ships/fittings?q=drake');
    expect(await screen.findByText('Armor Drake', {}, { timeout: 5000 })).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Search fittings' });
    expect(search).toHaveValue('drake');
    expect(screen.queryByText('Kite')).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'kite');
    // `useNavigate` is mocked in this file, so the write is read off the mock.
    await waitFor(() =>
      expect(navigateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ pathname: '/ships/fittings', search: '?q=kite' }),
        expect.objectContaining({ replace: true })
      )
    );
  });

  it('previews the picked row and Open hands a saved one to openSaved', async () => {
    const workspace = renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /^Kite/ }));
    expect(screen.getByText('preview of Kite')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open fitting' }));
    expect(workspace.openSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('Open hands an In-game one to openLoaded, mapped', async () => {
    const workspace = renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /^Armor Drake/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Open fitting' }));
    expect(workspace.openLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        fitting: expect.objectContaining({ name: 'Armor Drake', shipTypeId: 24698 }),
      })
    );
  });

  it('gives each row a menu: Open, and Rename / Delete for a saved one only', async () => {
    const workspace = renderScreen();
    await userEvent.click(
      await screen.findByRole('button', { name: 'More actions for Armor Drake' })
    );
    expect(await screen.findByRole('menuitem', { name: 'Copy Fitting' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Kite' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(await screen.findByLabelText('Fitting name')).toHaveValue('Kite');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Kite' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open' }));
    expect(workspace.openSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('Compare goes to the compare page with the fitting in ?f=', async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /^Kite/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(navigateMock).toHaveBeenCalledWith('/ships/fittings/compare?f=1.abc');
  });

  it('keeps edited notes on a saved fitting, and only there', async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /^Kite/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    await vi.waitFor(async () => expect((await db.fittings.get('r1'))?.notes).toBe('Kite first.'));

    await userEvent.click(screen.getByRole('button', { name: /^Armor Drake/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(await db.fittings.count()).toBe(1);
  });

  it('opens Import in a dialog, with the Load card', async () => {
    renderScreen();
    await screen.findByText('Armor Drake');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();
  });

  it('opens Import by itself when a share link is already broken on arrival', async () => {
    renderScreen({ ...makeWorkspace(), shareError: 'invalid' });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('Enter on a row opens it and the arrow keys walk the list', async () => {
    const workspace = renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /^Armor Drake/ }));
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByText('preview of Kite')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(workspace.openSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('tags In-game rows as well as saved ones, so a fitting in both shows which is which', async () => {
    renderScreen();
    const inGameRow = await screen.findByRole('button', { name: /^PvP Rifter/ });
    expect(within(inGameRow).getByText('In-game')).toBeInTheDocument();
    expect(
      within(await screen.findByRole('button', { name: /^Kite/ })).getByText('Saved')
    ).toBeInTheDocument();
  });

  it('opens the hull search from New from hull', async () => {
    renderScreen();
    await screen.findByText('Armor Drake');
    await userEvent.click(screen.getByRole('button', { name: 'New from hull' }));
    expect(await screen.findByRole('searchbox', { name: 'Search hulls' })).toBeInTheDocument();
  });

  it('says so when there is nothing saved or In-game', async () => {
    await db.fittings.clear();
    loadInGameFittingsMock.mockResolvedValue({
      cached: { data: [], fetchedAt: new Date(), fromCache: false, truncated: false },
      needsReauth: false,
    });
    renderScreen();
    expect(await screen.findByText('No fittings yet')).toBeInTheDocument();
  });

  describe('empty library', () => {
    async function emptyLibrary() {
      await db.fittings.clear();
      loadInGameFittingsMock.mockResolvedValue({
        cached: { data: [], fetchedAt: new Date(), fromCache: false, truncated: false },
        needsReauth: false,
      });
    }

    it('says what a fitting is and links the Ship Tree, with no EFT jargon', async () => {
      await emptyLibrary();
      renderScreen();
      await screen.findByText('No fittings yet');
      const link = screen.getByRole('link', { name: 'Ship Tree' });
      expect(link).toHaveAttribute('href', '/ships/tree');
      const hint = link.closest('p')!;
      expect(hint).toHaveTextContent('A fitting is the set of modules on a ship.');
      expect(hint.textContent).not.toMatch(/EFT|Ctrl\+V/);
    });

    it('offers to fit the flown hull beside New from hull, and opens the editor on it', async () => {
      await emptyLibrary();
      shipTypeIdMock.mockReturnValue({ typeId: 587, status: 'ready' });
      const onStartHull = vi.fn();
      renderScreen(makeWorkspace(), onStartHull);
      const fit = await screen.findByRole('button', { name: 'Fit your Rifter' });
      expect(fit.className).toContain('bg-accent');
      // One New from hull: the empty state's, not a second one in the toolbar.
      expect(screen.getAllByRole('button', { name: 'New from hull' })).toHaveLength(1);
      await userEvent.click(fit);
      expect(onStartHull).toHaveBeenCalledWith({ typeId: 587, name: 'Rifter' });
    });

    it('shows only New from hull without the current-ship grant', async () => {
      await emptyLibrary();
      renderScreen();
      await screen.findByText('No fittings yet');
      await screen.findByRole('button', { name: 'New from hull' });
      expect(screen.queryByRole('button', { name: /^Fit your/ })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'New from hull' })).toHaveLength(1);
    });

    it('never offers to fit a pod', async () => {
      await emptyLibrary();
      shipTypeIdMock.mockReturnValue({ typeId: 670, status: 'ready' });
      renderScreen();
      await screen.findByText('No fittings yet');
      // The buttons wait for the hull's type to load, so this is after the pod check ran.
      await screen.findByRole('button', { name: 'New from hull' });
      expect(screen.queryByRole('button', { name: /^Fit your/ })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'New from hull' })).toHaveLength(1);
    });
  });

  it('explains EFT and Ctrl+V in the Import dialog', async () => {
    renderScreen();
    await screen.findByText('Armor Drake');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/press Ctrl\+V anywhere/)).toBeInTheDocument();
  });

  it('shows a re-auth banner, and never fetches, when the fittings scope is missing', async () => {
    useEndpointsGrantedMock.mockReturnValue(false);
    renderScreen();
    expect(await screen.findByText('Allow fittings access')).toBeInTheDocument();
    expect(loadInGameFittingsMock).not.toHaveBeenCalled();
    // The saved ones still list.
    expect(await screen.findByRole('button', { name: /^Kite/ })).toBeInTheDocument();
  });

  it("opens an In-game fitting with what it can't map (a service slot) as the Load's warnings", async () => {
    loadInGameFittingsMock.mockResolvedValue({
      cached: {
        data: [
          inGameFitting({
            items: [
              { flag: 'HiSlot0', quantity: 1, type_id: 484 },
              { flag: 'ServiceSlot0', quantity: 1, type_id: 99 },
            ],
          }),
        ],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    const workspace = renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /^PvP Rifter/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Open fitting' }));
    expect(workspace.openLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        unresolved: [
          { text: 'ServiceSlot0', reason: 'unsupported slot', kind: 'unsupported-slot' },
        ],
      })
    );
  });
});

describe('FittingStartScreen on a phone', () => {
  beforeEach(() => isPhoneMock.mockReturnValue(true));

  it('opens a fitting with one tap, with no preview, keeping New from hull and Import', async () => {
    const workspace = renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /^Kite/ }));
    expect(workspace.openSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    expect(screen.queryByText(/^preview of/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Kite/ })).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: 'New from hull' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('still gives each row its menu', async () => {
    renderScreen();
    expect(
      await screen.findByRole('button', { name: 'More actions for Armor Drake' })
    ).toBeInTheDocument();
  });
});

describe('FittingStartScreen in a dialog', () => {
  it('is the list alone, and a tap opens the row and reports it', async () => {
    const { workspace, onOpened } = renderDialog();
    await userEvent.click(await screen.findByRole('button', { name: /^Armor Drake/ }));
    expect(workspace.openLoaded).toHaveBeenCalledWith(
      expect.objectContaining({ fitting: expect.objectContaining({ name: 'Armor Drake' }) })
    );
    expect(onOpened).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'New from hull' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
  });

  it("keeps its search off the URL: it is a passing pick over another page's address", async () => {
    renderDialog();
    await screen.findByText('Armor Drake', {}, { timeout: 5000 });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search fittings' }), 'kite');
    expect(screen.queryByText('Armor Drake')).not.toBeInTheDocument();
    // Past the URL's typing debounce: still nothing written. `useNavigate` is
    // mocked in this file, so "nothing written" is no call to it.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('keeps the In-game refresh by the search, with no page header to hold it', async () => {
    renderDialog();
    expect(
      await screen.findByRole('button', { name: 'Refresh' }, { timeout: 5000 })
    ).toBeInTheDocument();
  });

  it('empty, says where fittings come from rather than offering buttons it lacks', async () => {
    await db.fittings.clear();
    loadInGameFittingsMock.mockResolvedValue({
      cached: { data: [], fetchedAt: new Date(), fromCache: false, truncated: false },
      needsReauth: false,
    });
    renderDialog();
    expect(
      await screen.findByText('Fittings you save, here or in EVE, list here.')
    ).toBeInTheDocument();
  });

  it('never pops Import by itself over a broken share link', async () => {
    renderDialog({}, { ...makeWorkspace(), shareError: 'invalid' });
    await screen.findByText('Armor Drake');
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
  });

  it('as the Compare picker: Import swaps in place, Back returns, and rows have no menus', async () => {
    renderDialog({ importInline: true, rowMenus: false });
    await screen.findByText('Armor Drake');
    expect(screen.queryByRole('button', { name: /^More actions/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to fittings' }));
    expect(await screen.findByText('Armor Drake')).toBeInTheDocument();
  });

  it('says why a picked fitting went nowhere when it is too large for a Share Link', async () => {
    renderDialog({ importInline: true }, { ...makeWorkspace(), tooLargeToShare: true });
    await screen.findByText('Armor Drake');
    expect(screen.getByRole('status')).toHaveTextContent(/too large/i);
  });

  it('never shows that in the editor’s Open dialog, where it is about the open Fitting', async () => {
    renderDialog({}, { ...makeWorkspace(), tooLargeToShare: true });
    await screen.findByText('Armor Drake');
    expect(screen.queryByText(/too large/i)).not.toBeInTheDocument();
  });
});

describe('FittingStartScreen Active Fit', () => {
  const SHIP_ID = 1_000_000_001;
  beforeEach(() => {
    loadCharacterShipMock.mockResolvedValue({
      ship_item_id: SHIP_ID,
      ship_type_id: 587,
      ship_name: 'Zipper',
    });
    loadCharacterAssetsMock.mockResolvedValue({
      cached: {
        data: [
          {
            item_id: 11,
            type_id: 484,
            quantity: 1,
            location_id: SHIP_ID,
            location_type: 'item',
            location_flag: 'HiSlot0',
            is_singleton: true,
          },
          // Another ship's module.
          {
            item_id: 12,
            type_id: 484,
            quantity: 1,
            location_id: 99,
            location_type: 'item',
            location_flag: 'HiSlot0',
            is_singleton: true,
          },
        ],
      },
      needsReauth: false,
    });
  });

  it('leads the list under its own heading, is picked first, and says its modules can lag', async () => {
    renderScreen();
    const list = await screen.findByRole('navigation', { name: 'Your fittings' });
    const heading = await within(list).findByRole('heading', { name: 'Active fit' });
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByText('Zipper')).toBeInTheDocument();
    expect(within(section).getByText('Rifter')).toBeInTheDocument();
    expect(within(section).getByText(/up to an hour behind/)).toBeInTheDocument();
    expect(within(list).getAllByRole('heading')[0]).toBe(heading);
    expect(await screen.findByText('preview of Zipper')).toBeInTheDocument();
    // Only what sits inside the flown ship is read as its fit.
    expect(shipItemsToFittingMock).toHaveBeenCalledWith({ typeId: 587, name: 'Zipper' }, [
      { typeId: 484, quantity: 1, flag: 'HiSlot0', itemId: 11 },
    ]);
  });

  it('Open hands the flown ship to openLoaded', async () => {
    const workspace = renderScreen();
    await screen.findByText('preview of Zipper');
    await userEvent.click(screen.getByRole('button', { name: 'Open fitting' }));
    expect(workspace.openLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        fitting: expect.objectContaining({ name: 'Zipper', shipTypeId: 587 }),
      })
    );
  });

  it('a search can hide it', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Active fit' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search fittings' }), 'drake');
    expect(screen.queryByRole('heading', { name: 'Active fit' })).not.toBeInTheDocument();
  });

  it('holds the list until it lands, so the pick never jumps to it', async () => {
    let land!: (ship: unknown) => void;
    loadCharacterShipMock.mockReturnValue(new Promise((resolve) => (land = resolve)));
    renderScreen();
    await waitFor(() => expect(loadCharacterShipMock).toHaveBeenCalled());
    expect(screen.queryByText('Armor Drake')).not.toBeInTheDocument();
    land({ ship_item_id: SHIP_ID, ship_type_id: 587, ship_name: 'Zipper' });
    expect(await screen.findByText('preview of Zipper')).toBeInTheDocument();
  });

  it('is left out when the assets could not be read, not shown as an empty hull', async () => {
    loadCharacterAssetsMock.mockResolvedValue({ cached: null, needsReauth: false });
    renderScreen();
    await screen.findByText('Armor Drake');
    expect(screen.queryByRole('heading', { name: 'Active fit' })).not.toBeInTheDocument();
    expect(shipItemsToFittingMock).not.toHaveBeenCalled();
  });

  it('is left out in a pod', async () => {
    loadCharacterShipMock.mockResolvedValue({
      ship_item_id: SHIP_ID,
      ship_type_id: 670,
      ship_name: 'Capsule',
    });
    renderScreen();
    await screen.findByText('Armor Drake');
    await waitFor(() => expect(loadCharacterShipMock).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Active fit' })).not.toBeInTheDocument();
    expect(shipItemsToFittingMock).not.toHaveBeenCalled();
  });

  it('is left out without the ship and assets grants, and reads nothing', async () => {
    useEndpointsGrantedMock.mockReturnValue(false);
    renderScreen();
    await screen.findByText('Kite');
    expect(loadCharacterShipMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Active fit' })).not.toBeInTheDocument();
  });
});
