import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router-dom';
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
import { Modal } from '@/components/ui';
import { PublicInfoModal } from '@/components/PublicInfoModal';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { EntityInfoRoute } from './EntityInfoRoute';
import { CharacterLink } from './EntityLink';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(async () => {
  await db.esiCache.clear();
  usePublicInfoModalStore.setState({ request: null });
  server.use(
    http.get(`${ESI_BASE_URL}/characters/:id`, () => HttpResponse.json({}, { status: 404 })),
    http.post(`${ESI_BASE_URL}/characters/affiliation`, () => HttpResponse.json([])),
    http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.json([]))
  );
});
afterEach(() => server.resetHandlers());

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

describe('?info= opened from inside an open Modal', () => {
  it('is a real same-page push: Back closes only the info modal, not the modal under it', async () => {
    window.history.replaceState(null, '', '/contracts');
    render(
      <BrowserRouter>
        <EntityInfoRoute />
        <Modal open onClose={() => {}} title="Outer detail">
          <CharacterLink id={1}>Pilot One</CharacterLink>
        </Modal>
        <PublicInfoModal />
        <Where />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByRole('link', { name: 'Pilot One' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?info=character-1'));
    await waitFor(() => expect(usePublicInfoModalStore.getState().request).not.toBeNull());

    window.history.back();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/contracts$/));
    await waitFor(() => expect(usePublicInfoModalStore.getState().request).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Outer detail' })).toBeInTheDocument();
  });
});
