import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale, FONT_SCALE_KEY, DEFAULT_FONT_SCALE } from '@/lib/fontScale';
import { useActivityLog } from '@/stores/activityLog';
import { NOTIFICATION_EVENTS } from '@/features/notifications/events';
import {
  useNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFS_SETTING_KEY,
} from '@/features/notifications/preferences';
import {
  useNotificationPromptState,
  DEFAULT_NOTIFICATION_PROMPT_STATE,
  NOTIFICATION_PERMISSION_PROMPT_KEY,
} from '@/features/notifications/permission';
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

/**
 * jsdom has no Notification API, so every test above renders the panel's
 * unsupported path (toggle UI, no notice) — the permission-specific tests
 * opt into a grant state explicitly.
 */
function stubNotification(permission: NotificationPermission) {
  const requestPermission = vi.fn(async () => permission);
  vi.stubGlobal('Notification', { permission, requestPermission });
  return requestPermission;
}

// Rendered through <App /> rather than in isolation: /settings has a nav
// entry now, so routing to it through the shell is part of what's asserted.
// Settings makes no requests, hence no msw server.
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useFontScale.setState({ value: DEFAULT_FONT_SCALE, hydrated: false });
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: false });
  useNotificationPromptState.setState({
    value: { ...DEFAULT_NOTIFICATION_PROMPT_STATE, seen: true },
    hydrated: true,
  });
  document.documentElement.style.fontSize = '';

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  useActivityLog.setState({ entries: [] });
  window.history.pushState({}, '', '/settings');
});

afterEach(() => {
  vi.unstubAllGlobals();
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

    act(() => {
      useActivityLog.getState().record({
        endpointId: 'getCharacterSkills',
        characterId: CHAR_ID,
        timestamp: Date.now(),
        outcome: 'success',
      });
    });

    expect(await screen.findByText('/characters/{character_id}/skills')).toBeInTheDocument();
    // The character name comes from a Dexie useLiveQuery, resolved async — wait for it
    // rather than asserting it's already there, or this races the query on a slow run.
    // Scoped to the Activity Log table: the Notifications section's collapsible
    // headers, and the shell's character menu, also render the character's name.
    const table = screen.getByRole('table', { name: /activity log/i });
    expect(await within(table).findByText('Pilot One')).toBeInTheDocument();
    expect(within(table).getByText('Succeeded')).toBeInTheDocument();
  });

  it('labels a public call and an auth-failure outcome distinctly (issue #32)', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    act(() => {
      useActivityLog.getState().record({
        endpointId: 'getUniverseType',
        timestamp: Date.now(),
        outcome: 'authFailure',
      });
    });

    expect(await screen.findByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Needs re-login')).toBeInTheDocument();
  });

  it('shows a full date, not just time, on a logged entry (issue #422)', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    const timestamp = new Date('2026-01-15T09:30:00Z').getTime();

    act(() => {
      useActivityLog.getState().record({
        endpointId: 'getCharacterSkills',
        characterId: CHAR_ID,
        timestamp,
        outcome: 'success',
      });
    });

    const table = screen.getByRole('table', { name: /activity log/i });
    expect(
      await within(table).findByText(new Date(timestamp).toLocaleString())
    ).toBeInTheDocument();
  });

  it('clears the log on demand, disabled when there is nothing to clear (issue #422)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(screen.getByRole('button', { name: /clear log/i })).toBeDisabled();

    act(() => {
      useActivityLog.getState().record({
        endpointId: 'getCharacterSkills',
        characterId: CHAR_ID,
        timestamp: Date.now(),
        outcome: 'success',
      });
    });
    await within(screen.getByRole('table', { name: /activity log/i })).findByText('Pilot One');

    const clearButton = screen.getByRole('button', { name: /clear log/i });
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);

    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    expect(await screen.findByText(/log cleared/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear log/i })).toBeDisabled();
  });

  it('clears cached ESI data on demand (issue #422)', async () => {
    const user = userEvent.setup();
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'skills',
      value: { total_sp: 1 },
      fetchedAt: 1,
    });
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /clear cached esi data/i }));

    expect(await screen.findByText(/cache cleared/i)).toBeInTheDocument();
    expect(await db.esiCache.count()).toBe(0);
  });
});

const ALL_NOTIFICATION_SCOPES = [...new Set(NOTIFICATION_EVENTS.map((event) => event.scope))];
const CHAR_2_ID = 92;

/**
 * Per-character controls in this panel (select-all checkboxes etc.) can share
 * an accessible name with another character's row, so a bare
 * `getByRole('button', { name: /pilot one/i })` risks matching more than one
 * once both are seeded. Same ambiguity the Activity Log assertion resolves by
 * naming its table: scope per-character queries to the Notifications panel
 * rather than the whole document.
 */
async function notificationsPanel(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: /^notifications$/i });
  const section = heading.closest('section');
  if (!section) throw new Error('Notifications panel has no section wrapper');
  return section as HTMLElement;
}

describe('Settings — Notifications (issue #170)', () => {
  beforeEach(async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 1000 * 60 * 60,
      scopes: ALL_NOTIFICATION_SCOPES,
    });
    await db.characters.put({
      characterId: CHAR_2_ID,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
    });
    await db.tokens.put({
      characterId: CHAR_2_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 1000 * 60 * 60,
      // Every scope except New Mail's — exercises the scope-gated disabled row.
      scopes: ALL_NOTIFICATION_SCOPES.filter((scope) => scope !== 'esi-mail.read_mail.v1'),
    });
  });

  it('lists one collapsible section per signed-in character, every event on by default except the feed-only exceptions', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const panel = await notificationsPanel();
    const pilotOneButton = await within(panel).findByRole('button', { name: /pilot one/i });
    expect(within(panel).getByRole('button', { name: /pilot two/i })).toBeInTheDocument();

    await user.click(pilotOneButton);

    expect(
      screen.getByRole('checkbox', { name: 'Skill Level Complete, browser notifications' })
    ).toBeChecked();
    // marketOrderFilled/walletBalanceChanged default feed-on/browser-off
    // (CONTEXT.md round 45) — worth a row, not worth an interruption.
    expect(
      screen.getByRole('checkbox', { name: 'Wallet Balance Changed, browser notifications' })
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Wallet Balance Changed, Overview list' })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Sell Order Filled, browser notifications' })
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Sell Order Filled, Overview list' })
    ).toBeChecked();
  });

  it('flips a single event off, then back on, persisting to Dexie', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await user.click(
      await within(await notificationsPanel()).findByRole('button', { name: /pilot one/i })
    );

    const mailCheckbox = screen.getByRole('checkbox', { name: 'New Mail, browser notifications' });
    await user.click(mailCheckbox);
    expect(mailCheckbox).not.toBeChecked();
    expect(
      (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
        ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES
    ).toEqual({
      masterEnabled: true,
      perCharacter: { [CHAR_ID]: { newMail: { browser: false, feed: true } } },
    });

    await user.click(mailCheckbox);
    expect(mailCheckbox).toBeChecked();
  });

  it('offers the extractor-expiring event on both channels and discloses the scheduled-push lead time', async () => {
    // Issue #358: extractor-expiring moved from an app-open poll to a
    // scheduled push delivered up to 72 hours ahead; the disclosure text
    // must reflect that, not the old 5-minute poll wording.
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await user.click(
      await within(await notificationsPanel()).findByRole('button', { name: /pilot one/i })
    );

    expect(
      screen.getByRole('checkbox', {
        name: 'Planetary Extractor Expiring, browser notifications',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: 'Planetary Extractor Expiring, Overview list',
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/delivered up to 72 hours ahead/i)).toBeInTheDocument();
  });

  it("select-all/none checkbox toggles every togglable event for that character's section", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await user.click(
      await within(await notificationsPanel()).findByRole('button', { name: /pilot one/i })
    );

    // The browser column starts indeterminate: Wallet Balance Changed/Market
    // Order Filled default browser-off while the rest default browser-on
    // (CONTEXT.md round 45). A partial column fills in rather than clears.
    await user.click(
      screen.getByRole('checkbox', { name: /toggle all browser notifications for pilot one/i })
    );

    expect(
      screen.getByRole('checkbox', { name: 'Skill Level Complete, browser notifications' })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Wallet Balance Changed, browser notifications' })
    ).toBeChecked();

    // Now fully enabled, so the next click clears the whole column.
    await user.click(
      screen.getByRole('checkbox', { name: /toggle all browser notifications for pilot one/i })
    );
    expect(
      screen.getByRole('checkbox', { name: 'Skill Level Complete, browser notifications' })
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Wallet Balance Changed, browser notifications' })
    ).not.toBeChecked();
  });

  it('the master switch persists independently of any per-character state', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(await screen.findByRole('checkbox', { name: /enable notifications/i }));

    expect((await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))?.value).toMatchObject({
      masterEnabled: false,
    });
  });

  it('shows a blocked notice and disables only the browser controls while permission is denied', async () => {
    const user = userEvent.setup();
    stubNotification('denied');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByText(/notifications are blocked/i)).toBeInTheDocument();
    // JS cannot re-request a denied grant, so nothing that would need one is offered.
    expect(
      screen.queryByRole('button', { name: /turn on browser notifications/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Browser notifications' })).toBeDisabled();

    // ...but the Overview feed works with no grant at all, so its controls stay live.
    expect(screen.getByRole('checkbox', { name: 'Enable notifications' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Overview notifications' })).toBeEnabled();

    await user.click(
      await within(await notificationsPanel()).findByRole('button', { name: /pilot one/i })
    );
    expect(screen.getByRole('checkbox', { name: 'New Mail, Overview list' })).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: 'New Mail, browser notifications' })
    ).toBeDisabled();
  });

  it('offers an Enable button that makes the browser request, and no request without it', async () => {
    const requestPermission = stubNotification('default');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const enable = await screen.findByRole('button', { name: /turn on browser notifications/i });
    expect(requestPermission).not.toHaveBeenCalled();
    // The toggle UI stays put at 'default' — only a denial replaces it.
    expect(screen.getByRole('checkbox', { name: /enable notifications/i })).toBeInTheDocument();

    await user.click(enable);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    // The ask is recorded, so the one-time explainer never returns for someone
    // who came to Settings instead of using it.
    await waitFor(async () => {
      expect((await db.settings.get(NOTIFICATION_PERMISSION_PROMPT_KEY))?.value).toEqual({
        seen: true,
        outcome: 'default',
      });
    });
  });

  it('never requests permission on its own when the grant is already settled', async () => {
    const requestPermission = stubNotification('granted');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await user.click(
      await within(await notificationsPanel()).findByRole('button', { name: /pilot one/i })
    );

    expect(
      screen.getByRole('checkbox', { name: 'New Mail, browser notifications' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/notifications are blocked/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /turn on browser notifications/i })
    ).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("disables a row and shows a reauth hint for a character missing that event's ESI scope", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await user.click(
      await within(await notificationsPanel()).findByRole('button', { name: /pilot two/i })
    );

    const mailCheckbox = screen.getByRole('checkbox', { name: 'New Mail, browser notifications' });
    expect(mailCheckbox).toBeDisabled();
    // A disabled control can't take focus, so the tooltip only reveals on
    // hover — a real pointermove, not the click above.
    fireEvent.pointerMove(mailCheckbox);
    expect(await screen.findByText(/re-authorize the character/i)).toBeInTheDocument();

    expect(
      screen.getByRole('checkbox', { name: 'Skill Level Complete, browser notifications' })
    ).not.toBeDisabled();
  });

  it('search filters rows by event-type name across every character section', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.type(await screen.findByRole('searchbox'), 'mail');

    // Two levels up: the button's immediate parent is just the header row
    // (button + select-all checkbox); its parent is the whole section,
    // including the event rows.
    const pilotOneSection = within(await notificationsPanel())
      .getByRole('button', { name: /pilot one/i })
      .closest('div')!.parentElement!;
    expect(
      within(pilotOneSection).getByRole('checkbox', { name: 'New Mail, browser notifications' })
    ).toBeInTheDocument();
    expect(
      within(pilotOneSection).queryByRole('checkbox', {
        name: 'Skill Level Complete, browser notifications',
      })
    ).not.toBeInTheDocument();
  });

  it('search filters sections by character name, showing every event for the matching character', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.type(await screen.findByRole('searchbox'), 'Two');

    expect(
      within(await notificationsPanel()).queryByRole('button', { name: /pilot one/i })
    ).not.toBeInTheDocument();
    expect(
      within(await notificationsPanel()).getByRole('button', { name: /pilot two/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Skill Level Complete, browser notifications' })
    ).toBeInTheDocument();
  });
});
