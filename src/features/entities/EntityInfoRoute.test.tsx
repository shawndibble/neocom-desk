import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';

vi.mock('@/lib/zkillboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/zkillboard')>()),
  fetchPilotStats: vi.fn(async () => ({ kind: 'no-history' })),
  fetchPilotKillmails: vi.fn(async () => ({ ok: true, entries: [] })),
}));
vi.mock('@/sde/loadSde', () => ({ loadTypes: vi.fn(async () => ({})) }));
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { PublicInfoModal } from '@/components/PublicInfoModal';
import { usePublicInfoModalStore, openPublicInfoModal } from '@/stores/publicInfoModal';
import { useSkillDetailModalStore, openSkillDetailModal } from '@/stores/skillDetailModal';
import { openItemInfo, useItemInfoModalStore } from '@/stores/itemInfoModal';
import { usePlaceInfoModalStore } from '@/stores/placeInfoModal';
import { EntityInfoRoute } from './EntityInfoRoute';
import { CharacterLink, FactionLink, PlaceLink, SkillLink, SystemLink } from './EntityLink';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(async () => {
  await db.esiCache.clear();
  usePublicInfoModalStore.setState({ request: null });
  useSkillDetailModalStore.setState({ request: null, staged: null });
  server.use(
    http.get(`${ESI_BASE_URL}/characters/:id`, () => HttpResponse.json({}, { status: 404 })),
    http.post(`${ESI_BASE_URL}/characters/affiliation`, () => HttpResponse.json([])),
    http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.json([]))
  );
});
afterEach(() => server.resetHandlers());

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

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <EntityInfoRoute />
      <PublicInfoModal />
      <Probe />
      <CharacterLink id={1}>Pilot One</CharacterLink>
      <SkillLink typeId={3300}>Gunnery</SkillLink>
      <SystemLink systemId={30000142}>Jita</SystemLink>
      <PlaceLink id={60003760}>Jita IV - Moon 4</PlaceLink>
    </MemoryRouter>
  );
}

describe('entity links', () => {
  it('a CharacterLink is an anchor to the current page with info set', () => {
    renderAt('/contracts?tab=a');
    expect(screen.getByRole('link', { name: 'Pilot One' })).toHaveAttribute(
      'href',
      '/contracts?tab=a&info=character-1'
    );
    expect(screen.getByRole('link', { name: 'Gunnery' })).toHaveAttribute(
      'href',
      '/contracts?tab=a&info=skill-3300'
    );
  });

  it('a SystemLink goes to Route Safety with the system as the destination', () => {
    renderAt('/contracts');
    const href = screen.getByRole('link', { name: 'Jita' }).getAttribute('href');
    expect(href).toContain('/route');
    expect(href).toContain('30000142');
  });
});

describe('EntityInfoRoute', () => {
  it('opens Public Info for ?info=character-1 on a cold URL', async () => {
    renderAt('/contacts?info=character-1');
    await screen.findByRole('dialog');
    expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'character', id: 1 });
  });

  it('a PlaceLink sets Place Info on the URL and the store; Back clears it', async () => {
    renderAt('/contacts');
    expect(screen.getByRole('link', { name: 'Jita IV - Moon 4' })).toHaveAttribute(
      'href',
      '/contacts?info=place-60003760'
    );
    fireEvent.click(screen.getByRole('link', { name: 'Jita IV - Moon 4' }));
    await waitFor(() =>
      expect(usePlaceInfoModalStore.getState().request).toEqual({ id: 60003760 })
    );
    expect(usePublicInfoModalStore.getState().request).toBeNull();

    act(() => void probe.navigate(-1));
    await waitFor(() => expect(usePlaceInfoModalStore.getState().request).toBeNull());
  });

  it('a FactionLink opens a faction request through the URL, and Back clears it', async () => {
    // No modal mounted: this is the URL-to-store seam alone.
    render(
      <MemoryRouter initialEntries={['/contacts?tab=standings']}>
        <EntityInfoRoute />
        <Probe />
        <FactionLink id={500001}>Caldari State</FactionLink>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'Caldari State' });
    expect(link).toHaveAttribute('href', '/contacts?tab=standings&info=faction-500001');
    fireEvent.click(link);
    await waitFor(() =>
      expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'faction', id: 500001 })
    );
    act(() => void probe.navigate(-1));
    await waitFor(() => expect(usePublicInfoModalStore.getState().request).toBeNull());
    expect(probe.search).toBe('?tab=standings');
  });

  it('shows no modal without info', () => {
    renderAt('/contacts');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a link click opens the modal; Back closes it', async () => {
    renderAt('/contacts');
    fireEvent.click(screen.getByRole('link', { name: 'Pilot One' }));
    await screen.findByRole('dialog');
    expect(probe.search).toBe('?info=character-1');

    act(() => void probe.navigate(-1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probe.search).toBe('');
  });

  it('closing a modal this app opened goes back, returning to the URL without info', async () => {
    renderAt('/contacts?tab=a');
    fireEvent.click(screen.getByRole('link', { name: 'Pilot One' }));
    await screen.findByRole('dialog');

    usePublicInfoModalStore.getState().close();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probe.search).toBe('?tab=a');
  });

  it('closing a cold-opened modal replaces the URL without info and keeps other params', async () => {
    renderAt('/contacts?tab=a&info=character-1');
    await screen.findByRole('dialog');

    usePublicInfoModalStore.getState().close();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probe.pathname).toBe('/contacts');
    expect(probe.search).toBe('?tab=a');
  });

  it('a programmatic open goes through the URL', async () => {
    renderAt('/contacts');
    act(() => openPublicInfoModal('corporation', 7));
    await screen.findByRole('dialog');
    expect(probe.search).toBe('?info=corporation-7');
  });

  it('a programmatic item open carries an owned item id through the URL', async () => {
    renderAt('/assets');
    act(() => openItemInfo(47408, 'Abyssal MWD', 1040000000001));
    await waitFor(() =>
      expect(useItemInfoModalStore.getState().request).toEqual({
        typeId: 47408,
        itemName: 'Abyssal MWD',
        itemId: 1040000000001,
      })
    );
    expect(probe.search).toBe('?info=type-47408-1040000000001');
    act(() => useItemInfoModalStore.getState().clear());
  });

  it('a programmatic skill open carries its plan entries alongside the URL', async () => {
    renderAt('/skills');
    const planEntries = [{ skillTypeID: 3300, targetLevel: 3 }];
    act(() => openSkillDetailModal(3315, { planEntries }));
    await waitFor(() =>
      expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3315, planEntries })
    );
    expect(probe.search).toBe('?info=skill-3315');
  });

  it('a SkillLink click stages its plan entries for the modal', async () => {
    const planEntries = [{ skillTypeID: 3300, targetLevel: 3 }];
    render(
      <MemoryRouter initialEntries={['/skills']}>
        <EntityInfoRoute />
        <SkillLink typeId={3315} planEntries={planEntries}>
          Surgical Strike
        </SkillLink>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('link', { name: 'Surgical Strike' }));
    await waitFor(() =>
      expect(useSkillDetailModalStore.getState().request).toEqual({ typeID: 3315, planEntries })
    );
  });
  it('a Ctrl+click does not stage plan entries, and an open then close leaves none staged', async () => {
    const planEntries = [{ skillTypeID: 3300, targetLevel: 3 }];
    render(
      <MemoryRouter initialEntries={['/skills']}>
        <EntityInfoRoute />
        <SkillLink typeId={3315} planEntries={planEntries}>
          Surgical Strike
        </SkillLink>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'Surgical Strike' });
    fireEvent.click(link, { ctrlKey: true });
    expect(useSkillDetailModalStore.getState().staged).toBeNull();

    fireEvent.click(link);
    await waitFor(() => expect(useSkillDetailModalStore.getState().request).not.toBeNull());
    expect(useSkillDetailModalStore.getState().staged).toBeNull();
    act(() => useSkillDetailModalStore.getState().close());
    await waitFor(() => expect(useSkillDetailModalStore.getState().request).toBeNull());
    expect(useSkillDetailModalStore.getState().staged).toBeNull();
  });

  it('strips info when the page changes under it', async () => {
    renderAt('/contacts?tab=a&info=character-1');
    await screen.findByRole('dialog');
    act(() => void probe.navigate('/mail?tab=a&info=character-1'));
    await waitFor(() => expect(probe.search).toBe('?tab=a'));
    expect(probe.pathname).toBe('/mail');
  });

  it('keeps info when Back returns to an entry that has it, after leaving the page', async () => {
    renderAt('/contacts?tab=a');
    fireEvent.click(screen.getByRole('link', { name: 'Pilot One' }));
    await screen.findByRole('dialog');
    act(() => void probe.navigate('/mail'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    act(() => void probe.navigate(-1));
    await waitFor(() => expect(probe.pathname).toBe('/contacts'));
    expect(probe.search).toBe('?tab=a&info=character-1');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('strips info on a tab switch within the page', async () => {
    renderAt('/market/browser?info=character-1');
    await screen.findByRole('dialog');
    act(() => void probe.navigate('/market/orders?info=character-1'));
    await waitFor(() => expect(probe.search).toBe(''));
    expect(probe.pathname).toBe('/market/orders');
  });

  it('keeps info, and the modal, through a redirect: the cold tab landing replaces the path', async () => {
    // A cold `/market?info=…` lands through TabRoute's `<Navigate replace>`
    // to the default tab; that is the same visit, not a page change.
    renderAt('/market?info=character-1');
    await screen.findByRole('dialog');
    act(() => void probe.navigate('/market/browser?info=character-1', { replace: true }));
    await waitFor(() => expect(probe.pathname).toBe('/market/browser'));
    expect(probe.search).toBe('?info=character-1');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'character', id: 1 });
  });

  it('returns focus to the link that opened the modal', async () => {
    renderAt('/contacts');
    const link = screen.getByRole('link', { name: 'Pilot One' });
    link.focus();
    fireEvent.click(link);
    await screen.findByRole('dialog');
    usePublicInfoModalStore.getState().close();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(link).toHaveFocus();
  });
});
