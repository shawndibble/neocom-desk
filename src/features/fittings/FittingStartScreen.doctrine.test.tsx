import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

function renderScreen(characterId = 7) {
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
    <MemoryRouter>
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
  await seedCharacter(7, 'Pilot', { corporationId: CORP });
  await seedCharacter(8, 'Alt', { corporationId: OTHER_CORP });
  doctrines.listCorpDoctrineFits.mockImplementation(async (_char: number, corp: number) =>
    corp === CORP ? fits() : []
  );
});

describe('Doctrine Fits in the library', () => {
  it('lists the corp’s fits under their hull with a Doctrine tag, and opens one like an import', async () => {
    const { workspace } = renderScreen();
    const row = await screen.findByRole('button', { name: /^Fleet Rifter/ });
    expect(within(row).getByText('Doctrine')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rifter' })).toBeInTheDocument();
    expect(doctrines.listCorpDoctrineFits).toHaveBeenCalledWith(7, CORP);

    await userEvent.click(row);
    expect(workspace.loadFromInput).toHaveBeenCalledWith(code);
    expect(workspace.openSaved).not.toHaveBeenCalled();
  });

  it('gives a Doctrine row Open, Compare and Save a copy, with no Rename or Delete', async () => {
    renderScreen();
    await userEvent.click(
      await screen.findByRole('button', { name: 'More actions for Fleet Rifter' })
    );
    expect(await screen.findByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Compare with' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Save a copy' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /share/i })).not.toBeInTheDocument();
  });

  it('Save a copy keeps a private Fitting of the corp’s code', async () => {
    renderScreen();
    await userEvent.click(
      await screen.findByRole('button', { name: 'More actions for Fleet Rifter' })
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Save a copy' }));
    await waitFor(async () => expect(await db.fittings.count()).toBe(1));
    const [copy] = await db.fittings.toArray();
    expect(copy).toMatchObject({ characterId: 7, code });
  });

  it('notes a fit saved before the corp kept the whole fit (no preview pane)', async () => {
    phone.value = true;
    renderScreen();
    const old = await screen.findByRole('button', { name: /^Old Rifter/ });
    expect(
      within(old).getByText(
        'Saved without drones or charges. A Director can re-save it to include them.'
      )
    ).toBeInTheDocument();
    const full = screen.getByRole('button', { name: /^Fleet Rifter/ });
    expect(within(full).queryByText(/Saved without/)).not.toBeInTheDocument();
  });

  it('follows the Character: another corp’s fits, or none, and no empty state', async () => {
    const { switchTo } = renderScreen();
    await screen.findByRole('button', { name: /^Fleet Rifter/ });
    await act(async () => switchTo(8));
    await waitFor(() => expect(doctrines.listCorpDoctrineFits).toHaveBeenCalledWith(8, OTHER_CORP));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Fleet Rifter/ })).not.toBeInTheDocument()
    );
    expect(screen.queryByText(/doctrine/i)).not.toBeInTheDocument();
  });

  it('lists nothing when the member check refuses (a Character who left the corp)', async () => {
    doctrines.listCorpDoctrineFits.mockRejectedValue(new Error('wrong-corp'));
    renderScreen();
    await waitFor(() => expect(doctrines.listCorpDoctrineFits).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Rifter/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/doctrine/i)).not.toBeInTheDocument();
  });
});
