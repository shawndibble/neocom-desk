import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import type { MemberDoctrineFit } from '@/features/corp/srpTypes';
import { seedCharacter } from '@/test/seed';
import { FittingStartScreen } from './FittingStartScreen';
import { clearDoctrineFitsCache } from './corpDoctrineFittings';
import type { FittingLibrarySource } from './useFittingPicker';

vi.mock('@/app/useGrantedScopes', () => ({
  useEndpointsGranted: () => false,
  useGrantedScopes: () => undefined,
}));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));
vi.mock('./inGameFittings', () => ({ loadInGameFittings: vi.fn() }));
vi.mock('./popularFits', () => ({ usePopularFits: () => ({ ok: true, fits: [] }) }));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({ '587': { name: 'Rifter' } })),
  loadTypeEffects: vi.fn(async () => ({})),
  loadFittingSlots: vi.fn(async () => ({ 10: 'high' })),
}));
vi.mock('@/sync', () => ({ scheduleSync: vi.fn(), markFittingDeleted: vi.fn() }));
const phone = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: () => phone.value }));
vi.mock('./FittingPreview', () => ({ FittingPreview: () => null }));
vi.mock('@/features/communities/sharedFittings', () => ({
  loadSharedFittings: vi.fn(async () => ({
    communities: [],
    fittings: [],
    sharerNames: new Map(),
  })),
  toggleShare: vi.fn(),
}));
const doctrines = vi.hoisted(() => ({ listCorpDoctrineFits: vi.fn() }));
vi.mock('@/features/corp/srpDoctrineClient', () => doctrines);

const CORP = 98000001;
const OTHER_CORP = 98000002;
const FLEET: Fitting = {
  name: 'Fleet Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 10, state: 'active', chargeTypeId: 30 }],
  drones: [],
  cargo: [],
};
const snapshot = { hullTypeId: 587, name: 'x', modules: [10], rigs: [] };
let code = '';
const fits = (): MemberDoctrineFit[] => [
  { id: 'a', name: 'Fleet Rifter', snapshot, shareCode: code },
  { id: 'b', name: 'Old Rifter', snapshot },
];

function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}
const urlSearch = () => screen.getByTestId('search').textContent;

function renderScreen(characterId = 7, url = '/fittings') {
  const workspace: FittingLibrarySource = {
    lastLoad: null,
    shareError: null,
    tooLargeToShare: false,
    loadFromInput: vi.fn(),
    loadFittingXmlDocument: vi.fn(),
    openLoaded: vi.fn().mockResolvedValue(undefined),
    openSaved: vi.fn(),
  };
  const ui = (id: number) => (
    <MemoryRouter initialEntries={[url]}>
      <LocationProbe />
      <FittingStartScreen
        workspace={workspace}
        catalogue={null}
        characterId={id}
        inGameKey={0}
        onStartHull={vi.fn()}
      />
    </MemoryRouter>
  );
  const view = render(ui(characterId));
  return { workspace, switchTo: (id: number) => view.rerender(ui(id)) };
}

beforeEach(async () => {
  clearDoctrineFitsCache();
  vi.clearAllMocks();
  phone.value = false;
  await db.fittings.clear();
  await db.characters.clear();
  const encoded = await encodeFittingShare(fittingToShareInput(FLEET));
  if (!encoded.ok) throw new Error('encode failed');
  code = encoded.payload;
  await db.fittings.add({ id: 'k', characterId: 7, name: 'Kite', code, updatedAt: 1 });
  await seedCharacter(7, 'Pilot', { corporationId: CORP });
  await seedCharacter(8, 'Alt', { corporationId: OTHER_CORP });
  doctrines.listCorpDoctrineFits.mockImplementation(async (_char: number, corp: number) =>
    corp === CORP ? fits() : []
  );
});

const sourceSelect = () => screen.queryByRole('combobox', { name: 'Source' });

async function pick(option: string) {
  await userEvent.click(await screen.findByRole('combobox', { name: 'Source' }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('the library Source filter', () => {
  it('offers only the sources with rows, and narrows the list to the pick', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /^Fleet Rifter/ });
    await userEvent.click(await screen.findByRole('combobox', { name: 'Source' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent?.replace('✓', ''))).toEqual([
      'All sources',
      'Saved',
      'Doctrine',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'Doctrine' }));
    expect(screen.queryByRole('button', { name: /^Kite/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Fleet Rifter/ })).toBeInTheDocument();

    await pick('Saved');
    expect(screen.getByRole('button', { name: /^Kite/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Fleet Rifter/ })).not.toBeInTheDocument();
  });

  it('applies the search on top of the pick', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /^Fleet Rifter/ });
    await pick('Doctrine');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search fittings' }), 'old');
    expect(screen.getByRole('button', { name: /^Old Rifter/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Fleet Rifter/ })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search fittings' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search fittings' }), 'kite');
    expect(screen.getByText('Nothing under Doctrine matches that search.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all sources' }));
    expect(screen.getByRole('button', { name: /^Kite/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('All sources');
  });

  it('says no fitting matches when no pick narrows the search', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /^Fleet Rifter/ });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search fittings' }), 'zzz');
    expect(screen.getByText('No fitting matches that search.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all sources' })).not.toBeInTheDocument();
  });

  it('drops a linked source that has no rows once every source has loaded', async () => {
    renderScreen(7, '/fittings?source=shared');
    await screen.findByRole('button', { name: /^Fleet Rifter/ });
    await waitFor(() => expect(urlSearch()).toBe(''));
  });

  it('keeps a linked source that has rows', async () => {
    renderScreen(7, '/fittings?source=doctrine');
    await screen.findByRole('button', { name: /^Fleet Rifter/ });
    expect(screen.queryByRole('button', { name: /^Kite/ })).not.toBeInTheDocument();
    expect(urlSearch()).toBe('?source=doctrine');
  });

  it('is not shown with one source', async () => {
    doctrines.listCorpDoctrineFits.mockResolvedValue([]);
    renderScreen();
    await screen.findByRole('button', { name: /^Kite/ });
    await waitFor(() => expect(doctrines.listCorpDoctrineFits).toHaveBeenCalled());
    expect(sourceSelect()).not.toBeInTheDocument();
  });

  it('falls back to All sources when the picked source empties', async () => {
    await db.fittings.add({ id: 'k8', characterId: 8, name: 'Alt kite', code, updatedAt: 1 });
    await db.fittings.add({ id: 'k8b', characterId: 8, name: 'Alt brawl', code, updatedAt: 1 });
    const { switchTo } = renderScreen();
    await screen.findByRole('button', { name: /^Fleet Rifter/ });
    await pick('Doctrine');
    expect(screen.queryByRole('button', { name: /^Kite/ })).not.toBeInTheDocument();
    await act(async () => switchTo(8));
    expect(await screen.findByRole('button', { name: /^Alt kite/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Alt brawl/ })).toBeInTheDocument();
    expect(sourceSelect()).not.toBeInTheDocument();
  });
});
