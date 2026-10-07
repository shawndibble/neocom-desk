import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import '@/i18n';
import { db } from '@/db';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
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
vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({ '587': { name: 'Rifter' }, '24698': { name: 'Drake' } })),
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

function renderScreen(workspace = makeWorkspace(), onStartHull = vi.fn(), pageTitle?: string) {
  render(
    <MemoryRouter>
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
    expect(screen.queryByRole('menuitem', { name: 'Rename…' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Kite' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Import…' }));
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
    expect(screen.getByRole('button', { name: 'Import…' })).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Import…' })).not.toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: 'Import…' }));
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
