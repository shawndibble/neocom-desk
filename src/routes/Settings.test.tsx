import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale, FONT_SCALE_KEY, DEFAULT_FONT_SCALE } from '@/lib/fontScale';
import { useActivityLog } from '@/stores/activityLog';
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

// Rendered through <App /> rather than in isolation: /settings has a nav
// entry now, so routing to it through the shell is part of what's asserted.
// Settings makes no requests, hence no msw server.
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useFontScale.setState({ value: DEFAULT_FONT_SCALE, hydrated: false });
  document.documentElement.style.fontSize = '';

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  useActivityLog.setState({ entries: [] });
  window.history.pushState({}, '', '/settings');
});

describe('Settings', () => {
  it('renders the page heading and the font-scale control, defaulting to 100%', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /settings/i })).toBeInTheDocument();

    const group = screen.getByRole('group', { name: /text size/i });
    expect(group.querySelector('[aria-pressed="true"]')).toHaveTextContent(/default/i);
  });

  it('applies and persists the chosen scale immediately', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /^large$/i }));

    expect(screen.getByRole('button', { name: /^large$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(document.documentElement.style.fontSize).toBe('112.5%');
    expect((await db.settings.get(FONT_SCALE_KEY))?.value).toBe(1.125);
  });

  it('lists the keyboard shortcuts, so they are discoverable (issue #25)', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(screen.getByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByText('Jump to search')).toBeInTheDocument();
    expect(screen.getByText('Switch character')).toBeInTheDocument();
    expect(screen.getByText('Open Settings')).toBeInTheDocument();
    expect(screen.getByText('Close the open dialog')).toBeInTheDocument();
  });

  it('shows an empty state when nothing has been fetched yet (issue #32)', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(screen.getByRole('heading', { name: /activity log/i })).toBeInTheDocument();
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });

  it('lists a recorded entry by route template, character name, and outcome (issue #32)', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    useActivityLog.getState().record({
      endpointId: 'getCharacterSkills',
      characterId: CHAR_ID,
      timestamp: Date.now(),
      outcome: 'success',
    });

    expect(await screen.findByText('/characters/{character_id}/skills')).toBeInTheDocument();
    // The character name comes from a Dexie useLiveQuery, resolved async — wait for it
    // rather than asserting it's already there, or this races the query on a slow run.
    expect(await screen.findByText('Pilot One')).toBeInTheDocument();
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
  });

  it('labels a public call and an auth-failure outcome distinctly (issue #32)', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    useActivityLog.getState().record({
      endpointId: 'getUniverseType',
      timestamp: Date.now(),
      outcome: 'authFailure',
    });

    expect(await screen.findByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Needs re-login')).toBeInTheDocument();
  });
});
