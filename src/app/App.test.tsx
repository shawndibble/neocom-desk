import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from './App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// Landing on /overview mounts the real view, which reaches for several ESI
// surfaces. None of them is what these tests are about, so every ESI call
// answers 500 — the routing decision has to hold with the network unavailable,
// which is also the state a returning user's first frame is in.
const server = setupServer(
  http.get('https://esi.evetech.net/*', () =>
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
    expect(screen.getByText('Neocom Desk')).toBeInTheDocument();
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

  it('redirects / to /overview when a character is already active', async () => {
    await db.characters.put({
      characterId: 91,
      name: 'Pilot One',
      ownerHash: 'oh-1',
      addedAt: Date.now(),
    });
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 91 });
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/overview'));
    // The URL alone would also pass on a bounce that lands here and leaves
    // again, so assert on something only Overview renders: the rail dropped
    // /clones when it became one of this page's tabs (round 23).
    expect(await screen.findByRole('link', { name: 'Clones' })).toBeInTheDocument();
  });

  it('redirects / to /characters when characters exist but none is active', async () => {
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
