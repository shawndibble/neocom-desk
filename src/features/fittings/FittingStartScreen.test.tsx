import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({ '587': { name: 'Rifter' }, '24698': { name: 'Drake' } })),
}));
// The preview's numbers are the compare hooks' job; here it only proves which row is picked.
vi.mock('./FittingPreview', () => ({
  FittingPreview: ({
    row,
    onOpen,
    onCompare,
  }: {
    row: { name: string };
    onOpen: () => void;
    onCompare: (code: string) => void;
  }) => (
    <div>
      <p>preview of {row.name}</p>
      <button onClick={onOpen}>Open fitting</button>
      <button onClick={() => onCompare('1.abc')}>Compare</button>
    </div>
  ),
}));

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

function renderScreen(workspace = makeWorkspace(), onStartHull = vi.fn()) {
  render(
    <MemoryRouter>
      <FittingStartScreen
        workspace={workspace}
        catalogue={null}
        characterId={7}
        inGameKey={0}
        onStartHull={onStartHull}
      />
    </MemoryRouter>
  );
  return workspace;
}

beforeEach(async () => {
  vi.clearAllMocks();
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
    expect(await within(rifter).findByText('Kite')).toBeInTheDocument();
    expect(within(rifter).getByText('PvP Rifter')).toBeInTheDocument();
    expect(within(list).getByText('Armor Drake')).toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole('button', { name: /Kite/ }));
    expect(screen.getByText('preview of Kite')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open fitting' }));
    expect(workspace.openSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('Open hands an In-game one to openLoaded, mapped', async () => {
    const workspace = renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /Armor Drake/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Open fitting' }));
    expect(workspace.openLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        fitting: expect.objectContaining({ name: 'Armor Drake', shipTypeId: 24698 }),
      })
    );
  });

  it('Compare goes to the compare page with the fitting in ?f=', async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /Kite/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(navigateMock).toHaveBeenCalledWith('/fittings/compare?f=1.abc');
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
    await userEvent.click(await screen.findByRole('button', { name: /Armor Drake/ }));
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByText('preview of Kite')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(workspace.openSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('tags In-game rows as well as saved ones, so a fitting in both shows which is which', async () => {
    renderScreen();
    const inGameRow = await screen.findByRole('button', { name: /PvP Rifter/ });
    expect(within(inGameRow).getByText('In-game')).toBeInTheDocument();
    expect(
      within(await screen.findByRole('button', { name: /Kite/ })).getByText('Saved')
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
});
