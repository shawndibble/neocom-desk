import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { App } from '@/app/App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
const ESI = 'https://esi.evetech.net';

const contactsPayload = [
  { contact_id: 1001, contact_type: 'character' as const, standing: 10, is_watched: true },
  { contact_id: 1002, contact_type: 'corporation' as const, standing: 0 },
  { contact_id: 1003, contact_type: 'alliance' as const, standing: -10, is_blocked: true },
];

const server = setupServer(
  http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.json(contactsPayload)),
  http.post(`${ESI}/universe/names`, () =>
    HttpResponse.json([
      { id: 1001, name: 'Good Friend', category: 'character' },
      { id: 1002, name: 'Neutral Corp', category: 'corporation' },
      { id: 1003, name: 'Bad Alliance', category: 'alliance' },
    ])
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  usePublicInfoModalStore.setState({ request: null });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-characters.read_contacts.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/contacts');
});

describe('Contacts', () => {
  it('lists contacts with resolved names, standings, and blocked/watched flags', async () => {
    render(<App />);
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
    expect(screen.getByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.getByText('Bad Alliance')).toBeInTheDocument();
    expect(screen.getByText('Watched')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('filters by standing category', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    const badChip = screen.getByRole('button', { name: /Bad/ });
    fireEvent.click(badChip);

    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
    expect(screen.queryByText('Bad Alliance')).not.toBeInTheDocument();
  });

  it('falls back to cached contacts offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'contacts',
      value: contactsPayload,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.error()));
    render(<App />);
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.error()));
    render(<App />);
    expect(await screen.findByText(/no contacts cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the contacts scope was revoked', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your contacts')).toBeInTheDocument();
    expect(screen.queryByText(/no contacts cached/i)).not.toBeInTheDocument();
  });
});

describe('Contacts row context menu (issue #403)', () => {
  /** Right-clicks a contact row by its resolved name and returns the row. */
  async function openContactMenu(name: string) {
    const row = (await screen.findByText(name)).closest('tr');
    if (!row) throw new Error(`expected a ${name} contact row`);
    row.focus();
    fireEvent.contextMenu(row);
    return row;
  }

  it('offers Copy Name, Copy Contact ID, and Show Info as the only entry point to the modal', async () => {
    render(<App />);
    await openContactMenu('Good Friend');

    expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy Contact ID' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });

  it('Show Info opens the shared Public Info Modal, tabbed to the contact type', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${ESI}/characters/1001`, () =>
        HttpResponse.json({
          name: 'Good Friend',
          birthday: '2020-01-01T00:00:00Z',
          bloodline_id: 1,
          gender: 'male',
          race_id: 1,
          security_status: 1.5,
        })
      )
    );
    render(<App />);
    await openContactMenu('Good Friend');
    await user.click(screen.getByRole('menuitem', { name: 'Show info' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
  });
});

describe('Contacts standing filter chips (issue #403)', () => {
  it('stay visible through a manual refresh instead of disappearing', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    let resolveRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/contacts`, async () => {
        await refreshGate;
        return HttpResponse.json(contactsPayload);
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('group', { name: 'Standing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bad/ })).toBeInTheDocument();

    resolveRefresh();
    await waitFor(() => expect(screen.getByText('Good Friend')).toBeInTheDocument());
  });
});

describe('Contacts standing bar (issue #403)', () => {
  it('renders standing as a bar, not just a colored number', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    const goodRow = screen.getByText('Good Friend').closest('tr');
    expect(goodRow).not.toBeNull();
    expect(
      within(goodRow as HTMLElement).getByRole('img', { name: 'Standing: 10' })
    ).toBeInTheDocument();
  });
});
