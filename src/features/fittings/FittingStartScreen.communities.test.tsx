import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import type { SharedFitting } from '@/engine/communities/sharedFittings';
import { FittingStartScreen } from './FittingStartScreen';
import type { FittingLibrarySource } from './useFittingPicker';

// Shared Fittings in the library (issue #3605): rows from other Members, and
// the "Share to Community" menu item, absent / direct / submenu by how many
// Communities the Character is in.
vi.mock('@/app/useGrantedScopes', () => ({ useEndpointsGranted: () => false }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));
vi.mock('./inGameFittings', () => ({ loadInGameFittings: vi.fn() }));
vi.mock('./popularFits', () => ({ usePopularFits: () => ({ ok: true, fits: [] }) }));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({ '587': { name: 'Rifter' } })),
  loadTypeEffects: vi.fn(async () => ({})),
}));
vi.mock('@/sync', () => ({ scheduleSync: vi.fn(), markFittingDeleted: vi.fn() }));
const phone = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: () => phone.value }));
vi.mock('./FittingPreview', () => ({ FittingPreview: () => null }));

const shared = vi.hoisted(() => ({
  loadSharedFittings: vi.fn(),
  toggleShare: vi.fn(),
}));
vi.mock('@/features/communities/sharedFittings', () => shared);

const RIFTER: Fitting = { name: 'Kite', shipTypeId: 587, modules: [], drones: [], cargo: [] };
const PALS = { id: 'c1', name: 'Pals', adminUid: 'char:2', inviteCode: null, memberCount: 2 };
const CREW = { id: 'c2', name: 'Crew', adminUid: 'char:2', inviteCode: null, memberCount: 2 };

let code = '';
function theirs(over: Partial<SharedFitting> = {}): SharedFitting {
  return {
    communityId: 'c1',
    id: 'char:2~saved-z',
    ownerUid: 'char:2',
    source: 'saved',
    name: 'Bob’s Rifter',
    hull: 'Rifter',
    code,
    updatedAt: Date.UTC(2026, 9, 1),
    ...over,
  };
}

function loaded(communities: unknown[], fittings: SharedFitting[]) {
  shared.loadSharedFittings.mockResolvedValue({
    communities,
    fittings,
    sharerNames: new Map([['char:2', 'Bob']]),
  });
}

function renderScreen() {
  const workspace: FittingLibrarySource = {
    lastLoad: null,
    shareError: null,
    tooLargeToShare: false,
    loadFromInput: vi.fn(),
    loadFittingXmlDocument: vi.fn(),
    openLoaded: vi.fn().mockResolvedValue(undefined),
    openSaved: vi.fn(),
  };
  render(
    <MemoryRouter>
      <FittingStartScreen
        workspace={workspace}
        catalogue={null}
        characterId={7}
        inGameKey={0}
        onStartHull={vi.fn()}
      />
    </MemoryRouter>
  );
  return workspace;
}

beforeEach(async () => {
  vi.clearAllMocks();
  phone.value = false;
  await db.fittings.clear();
  const encoded = await encodeFittingShare(fittingToShareInput(RIFTER));
  if (!encoded.ok) throw new Error('encode failed');
  code = encoded.payload;
  await db.fittings.add({ id: 'r1', characterId: 7, name: 'Kite', code, updatedAt: 1 });
  shared.toggleShare.mockResolvedValue('shared');
});

describe('Community Fittings in the library', () => {
  it('lists another Member’s Fitting beside the saved ones, and Open loads it as an import', async () => {
    loaded([PALS], [theirs(), theirs({ id: 'char:7~saved-r1', ownerUid: 'char:7', name: 'Mine' })]);
    const workspace = renderScreen();
    const row = await screen.findByRole('button', { name: /^Bob’s Rifter/ });
    expect(screen.queryByRole('button', { name: /^Mine/ })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Shared in a Community' })).toBeInTheDocument();

    await userEvent.dblClick(row);
    expect(workspace.loadFromInput).toHaveBeenCalledWith(code);
    expect(workspace.openSaved).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'shows sharer and Community as visible text on the row (phone: %s)',
    async (isPhone) => {
      phone.value = isPhone;
      loaded([PALS], [theirs()]);
      renderScreen();
      const row = await screen.findByRole('button', { name: /^Bob’s Rifter/ });
      expect(within(row).getByText('Bob · Pals')).toHaveClass('truncate');
    }
  );

  it('says a former Member when the sharer is unknown, with no dangling separator', async () => {
    shared.loadSharedFittings.mockResolvedValue({
      communities: [PALS],
      fittings: [theirs()],
      sharerNames: new Map(),
    });
    renderScreen();
    const row = await screen.findByRole('button', { name: /^Bob’s Rifter/ });
    expect(within(row).getByText('a former Member · Pals')).toBeInTheDocument();
  });

  it('comma-joins several Communities', async () => {
    loaded([PALS, CREW], [theirs(), theirs({ communityId: 'c2' })]);
    renderScreen();
    const row = await screen.findByRole('button', { name: /^Bob’s Rifter/ });
    expect(within(row).getByText('Bob · Pals, Crew')).toBeInTheDocument();
  });

  it('keeps Saved rows to one line', async () => {
    loaded([PALS], [theirs()]);
    renderScreen();
    const row = await screen.findByRole('button', { name: /^Kite/ });
    expect(within(row).queryByText(/·/)).not.toBeInTheDocument();
  });

  it('gives a shared row Open, Compare and Save a copy, with no Rename or Delete', async () => {
    loaded([PALS], [theirs()]);
    renderScreen();
    await userEvent.click(
      await screen.findByRole('button', { name: 'More actions for Bob’s Rifter' })
    );
    expect(await screen.findByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Compare with' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Save a copy' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
  });
});

describe('Share to Community', () => {
  it('is absent when the Character is in no Community', async () => {
    loaded([], []);
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Kite' }));
    await screen.findByRole('menuitem', { name: 'Open' });
    expect(screen.queryByRole('menuitem', { name: /share/i })).not.toBeInTheDocument();
  });

  it('shares straight to the only Community', async () => {
    loaded([PALS], []);
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Kite' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Share to Pals' }));
    // The menu runs onSelect after the click settles, so wait for it.
    await waitFor(() =>
      expect(shared.toggleShare).toHaveBeenCalledWith(
        7,
        'c1',
        { source: 'saved', key: 'r1' },
        { name: 'Kite', code },
        false
      )
    );
  });

  it('offers to stop once it is shared there', async () => {
    loaded([PALS], [theirs({ id: 'char:7~saved-r1', ownerUid: 'char:7' })]);
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Kite' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Stop sharing in Pals' }));
    // The menu runs onSelect after the click settles, so wait for it.
    await waitFor(() =>
      expect(shared.toggleShare).toHaveBeenCalledWith(
        7,
        'c1',
        { source: 'saved', key: 'r1' },
        { name: 'Kite', code },
        true
      )
    );
  });

  it('is a submenu of Communities when the Character is in several', async () => {
    loaded([PALS, CREW], []);
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Kite' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Share to Community' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Share to Crew' }));
    // The menu runs onSelect after the click settles, so wait for it.
    await waitFor(() =>
      expect(shared.toggleShare).toHaveBeenCalledWith(
        7,
        'c2',
        { source: 'saved', key: 'r1' },
        { name: 'Kite', code },
        false
      )
    );
  });
});
