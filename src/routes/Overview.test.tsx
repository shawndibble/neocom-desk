import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const CHAR_ID = 91;
let lastAuthHeader: string | null = null;

const server = setupServer(
  http.get('https://esi.evetech.net/characters/:id/wallet', ({ request }) => {
    lastAuthHeader = request.headers.get('authorization');
    return HttpResponse.json(1234567.89);
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  lastAuthHeader = null;
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token-91',
    refreshToken: 'refresh-91',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-wallet.read_character_wallet.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/overview');
});

describe('Overview', () => {
  it('shows the active character name and wallet balance with data age', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Pilot One' })).toBeInTheDocument();
    expect(await screen.findByText(/1,234,567\.89/)).toBeInTheDocument();
    expect(screen.getByText('just now')).toBeInTheDocument();
    expect(lastAuthHeader).toBe('Bearer access-token-91');
  });

  it('falls back gracefully when the wallet fetch fails offline', async () => {
    server.use(
      http.get('https://esi.evetech.net/characters/:id/wallet', () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no wallet data cached/i)).toBeInTheDocument();
  });

  it('redirects to /characters when no active character is set', async () => {
    await db.settings.clear();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeInTheDocument();
  });
});
