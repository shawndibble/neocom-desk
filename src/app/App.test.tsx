import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from './App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const server = setupServer(
  http.get('https://esi.evetech.net/characters/:id', () =>
    HttpResponse.json({ error: 'offline' }, { status: 500 })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  window.history.pushState({}, '', '/');
});

describe('boot gate spinner (UX-REVIEW #1)', () => {
  it('shows the app name and a visible "Loading…" line, not a bare spinner', () => {
    render(<App />);
    expect(screen.getByText('NeoCom Desk')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('routing guard', () => {
  it('redirects / to /login when no characters exist', async () => {
    render(<App />);
    expect(
      (await screen.findAllByRole('button', { name: /log in with eve online/i })).length
    ).toBeGreaterThanOrEqual(1);
    expect(window.location.pathname).toBe('/login');
  });

  it('redirects / to /characters when a character exists', async () => {
    await db.characters.put({
      characterId: 91,
      name: 'Pilot One',
      ownerHash: 'oh-1',
      addedAt: Date.now(),
    });
    render(<App />);
    expect(await screen.findByText('Pilot One')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/characters');
  });
});
