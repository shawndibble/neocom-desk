import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
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

// Rendered through <App /> rather than in isolation: /settings has no nav
// entry, so routing to it at all is the thing worth asserting. Settings makes
// no requests, hence no msw server.
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/settings');
});

describe('Settings', () => {
  it('renders the page heading and the no-preferences empty state', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText(/no preferences yet/i)).toBeInTheDocument();
    expect(screen.getByText(/preferences will appear here/i)).toBeInTheDocument();
  });
});
