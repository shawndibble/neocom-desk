/**
 * The NPC info modal as the app mounts it: opened by URL (`?info=`), so a
 * Route Safety link out of it and Back return to the page with it open, and
 * its own Close follows the entity-modal rule. Data loaders are stubbed; this
 * is the router seam.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import '@/i18n';

const mocks = vi.hoisted(() => ({ where: vi.fn(), facts: vi.fn() }));
vi.mock('./npcInfoLoaders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./npcInfoLoaders')>()),
  loadChainData: vi.fn(async () => null),
  loadLoyalty: vi.fn(async () => null),
  loadWhereRows: mocks.where,
  loadFactionFacts: mocks.facts,
}));
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { PublicInfoModal } from '@/components/PublicInfoModal';
import { EntityInfoRoute } from '@/features/entities';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { openPublicInfoModal, usePublicInfoModalStore } from '@/stores/publicInfoModal';

const CALDARI_NAVY = 1000035;
const CALDARI = 500001;
const PERIMETER = 30000144;

const server = mswServer();
beforeEach(async () => {
  await db.esiCache.clear();
  usePublicInfoModalStore.setState({ request: null });
  useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
  mocks.where.mockReset().mockResolvedValue([
    {
      kind: 'nearest',
      stationId: 60000010,
      name: 'Perimeter VIII',
      systemId: PERIMETER,
      jumps: 1,
    },
  ]);
  mocks.facts.mockReset().mockResolvedValue({ name: 'Caldari State', description: 'A state.' });
  server.use(
    http.get(`${ESI_BASE_URL}/corporations/${CALDARI_NAVY}`, () =>
      HttpResponse.json({
        name: 'Caldari Navy',
        ticker: 'CN',
        ceo_id: 3000001,
        creator_id: 1,
        member_count: 0,
        tax_rates: { isk: 0 },
      })
    ),
    http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.json([]))
  );
});

const probe: { navigate: ReturnType<typeof useNavigate>; search: string; pathname: string } = {
  navigate: () => Promise.resolve(),
  search: '',
  pathname: '',
};
function Probe() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    probe.navigate = navigate;
    probe.search = location.search;
    probe.pathname = location.pathname;
  });
  return null;
}

function renderAt(entries: string[], index = entries.length - 1) {
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <EntityInfoRoute />
      <PublicInfoModal />
      <Probe />
    </MemoryRouter>
  );
}

describe('an NPC corporation in the info modal', () => {
  it('follows a Route Safety link out, and Back returns to the page with the modal open', async () => {
    renderAt(['/contacts?tab=standings']);
    act(() => openPublicInfoModal('corporation', CALDARI_NAVY));
    const jumps = await screen.findByRole('link', { name: '1 jump' });
    expect(probe.search).toBe(`?tab=standings&info=corporation-${CALDARI_NAVY}`);
    expect(jumps).toHaveAttribute('href', routeToHref(PERIMETER, undefined, undefined, 60000010));

    fireEvent.click(jumps);
    await waitFor(() => expect(probe.pathname).toBe('/travel/route'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    act(() => void probe.navigate(-1));
    await waitFor(() => expect(probe.pathname).toBe('/contacts'));
    expect(probe.search).toBe(`?tab=standings&info=corporation-${CALDARI_NAVY}`);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '1 jump' })).toBeInTheDocument();
  });

  it('Close goes back when the app pushed the entry, leaving the page behind it intact', async () => {
    renderAt(['/start', '/contacts?tab=standings'], 1);
    act(() => openPublicInfoModal('corporation', CALDARI_NAVY));
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probe.pathname).toBe('/contacts');
    expect(probe.search).toBe('?tab=standings');

    // It was a Back, not a replace: one more Back leaves the page, with no stray entry between.
    act(() => void probe.navigate(-1));
    await waitFor(() => expect(probe.pathname).toBe('/start'));
  });

  it('Close replaces a cold-opened URL with the plain page and never leaves the app', async () => {
    renderAt(['/start', `/contacts?tab=standings&info=corporation-${CALDARI_NAVY}`], 1);
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probe.pathname).toBe('/contacts');
    expect(probe.search).toBe('?tab=standings');
  });
});

describe('a faction in the info modal', () => {
  it('opens from ?info=faction-<id> as one view: its name, description and no tabs', async () => {
    renderAt([`/contacts?info=faction-${CALDARI}`]);
    const dialog = await screen.findByRole('dialog', { name: /Caldari State/ });
    expect(await screen.findByText('A state.')).toBeInTheDocument();
    expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'faction', id: CALDARI });
    expect(dialog.querySelector('[role="tab"]')).toBeNull();
  });

  it('follows a link out and Back returns with the faction open', async () => {
    mocks.where.mockResolvedValue([
      { kind: 'capital', systemId: 30000145, name: 'Caldari Prime', jumps: 4 },
    ]);
    renderAt(['/contacts']);
    act(() => openPublicInfoModal('faction', CALDARI));
    fireEvent.click(await screen.findByRole('link', { name: '4 jumps' }));
    await waitFor(() => expect(probe.pathname).toBe('/travel/route'));

    act(() => void probe.navigate(-1));
    await waitFor(() => expect(probe.search).toBe(`?info=faction-${CALDARI}`));
    expect(await screen.findByRole('dialog', { name: /Caldari State/ })).toBeInTheDocument();
  });
});
