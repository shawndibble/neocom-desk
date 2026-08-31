import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
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

const headers = [
  {
    mail_id: 1,
    from: 90000001,
    subject: 'Fleet up!',
    timestamp: '2026-08-02T00:00:00Z',
    is_read: false,
    labels: [],
  },
  {
    mail_id: 2,
    from: 90000002,
    subject: 'Market report',
    timestamp: '2026-08-01T00:00:00Z',
    is_read: true,
    labels: [],
  },
];

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () => HttpResponse.json(headers)),
  http.post('https://esi.evetech.net/universe/names', () =>
    HttpResponse.json([
      { id: 90000001, name: 'Fleet Commander', category: 'character' },
      { id: 90000002, name: 'Market Bot', category: 'character' },
    ])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/1`, () =>
    HttpResponse.json({
      from: 90000001,
      subject: 'Fleet up!',
      body: 'Undock <b>now</b>.',
      read: false,
    })
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

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-mail.read_mail.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/mail');
});

describe('Mail', () => {
  it('lists headers newest first with resolved sender names', async () => {
    render(<App />);
    expect(await screen.findByText('Fleet up!')).toBeInTheDocument();
    expect(await screen.findByText(/Fleet Commander/)).toBeInTheDocument();
    expect(await screen.findByText(/Market Bot/)).toBeInTheDocument();
  });

  it('shows the body, markup stripped, on click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));
    expect(await screen.findByText('Undock now.')).toBeInTheDocument();
  });

  it('falls back to cached headers offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: headers,
      fetchedAt: Date.now(),
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText('Fleet up!')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no mail cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the mail scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see mail')).toBeInTheDocument();
    expect(screen.queryByText(/no mail cached/i)).not.toBeInTheDocument();
  });
});
