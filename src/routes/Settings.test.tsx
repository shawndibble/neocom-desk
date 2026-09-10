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
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeFormat, DEFAULT_TIME_FORMAT, TIME_FORMAT_SETTING_KEY } from '@/lib/timeFormat';
import { useMarketHub } from '@/features/market/hub';
import { useAssumedMe, ASSUMED_ME_SETTING_KEY } from '@/features/industry/assumedMe';
import { useAssumedTe, ASSUMED_TE_SETTING_KEY } from '@/features/industry/assumedTe';
import {
  useFacilityDefaults,
  DEFAULT_FACILITY_DEFAULTS,
  FACILITY_DEFAULTS_SETTING_KEY,
} from '@/features/industry/facilityDefaults';
import { useExpiringWindowHours } from '@/features/pi/expiringWindow';
import { useDarkThreshold } from '@/features/corp/darkThreshold';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { VIEW_PREFERENCE_KEYS } from '@/lib/viewPreferenceKeys';

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

/** Switches Settings' own tab bar (General / Notifications / Data Age / Activity Log) — not app navigation. */
async function openTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await screen.findByRole('heading', { level: 1, name: /settings/i });
  await user.click(screen.getByRole('tab', { name }));
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
  // Module-scope singletons: a value left over from a previous test would
  // make the assertions below pass or fail for the wrong reason.
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  useAssumedMe.setState({ value: 0, hydrated: false });
  useAssumedTe.setState({ value: 0, hydrated: false });
  useFacilityDefaults.setState({ value: DEFAULT_FACILITY_DEFAULTS, hydrated: false });
  useExpiringWindowHours.setState({ value: 24, hydrated: false });
  useDarkThreshold.setState({ value: 30, hydrated: false });
  useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
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
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /activity log/i);

    expect(screen.getByRole('heading', { name: /activity log/i })).toBeInTheDocument();
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });

  it('lists a recorded entry by route template, character name, and outcome (issue #32)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /activity log/i);

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
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /activity log/i);

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
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /activity log/i);
    const timestamp = new Date('2026-01-15T09:30:00Z').getTime();

    act(() => {
      useActivityLog.getState().record({
        endpointId: 'getCharacterSkills',
        characterId: CHAR_ID,
        timestamp,
        outcome: 'success',
      });
    });

    // `findByRole`, not `getByRole`: the heading awaited above is the page
    // title, which arrives before the Activity Log section below it. A
    // synchronous query here has no retry, so on a loaded machine it throws
    // against a table that is only a tick away — which is exactly how this
    // failed in CI while passing locally.
    const table = await screen.findByRole('table', { name: /activity log/i });
    expect(
      await within(table).findByText(formatTimestamp(new Date(timestamp)))
    ).toBeInTheDocument();
  });

  it('clears the log on demand, disabled when there is nothing to clear (issue #422)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /activity log/i);

    expect(screen.getByRole('button', { name: /clear log/i })).toBeDisabled();

    act(() => {
      useActivityLog.getState().record({
        endpointId: 'getCharacterSkills',
        characterId: CHAR_ID,
        timestamp: Date.now(),
        outcome: 'success',
      });
    });
    // Awaited for the same reason as the test above: the table follows the
    // page heading rather than arriving with it.
    await within(await screen.findByRole('table', { name: /activity log/i })).findByText(
      'Pilot One'
    );

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

  it('Data Age tab shows an empty state when nothing has succeeded yet', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /data age/i);

    expect(screen.getByRole('heading', { name: /data age/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing fetched yet/i)).toBeInTheDocument();
  });

  it('Data Age tab lists only the latest successful fetch per endpoint/character, skipping failures (issue #32)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /data age/i);

    act(() => {
      const log = useActivityLog.getState();
      // Older success, superseded by the newer one below — must not double-list.
      log.record({
        endpointId: 'getCharacterSkills',
        characterId: CHAR_ID,
        timestamp: 1_000,
        outcome: 'success',
      });
      // A failed call after that never updated anything, so it's excluded
      // even though it's the most recent event for this endpoint/character.
      log.record({
        endpointId: 'getCharacterSkills',
        characterId: CHAR_ID,
        timestamp: 3_000,
        outcome: 'error',
      });
      log.record({
        endpointId: 'getCharacterSkills',
        characterId: CHAR_ID,
        timestamp: 2_000,
        outcome: 'success',
      });
    });

    const table = await screen.findByRole('table', { name: /data age/i });
    const rows = within(table).getAllByRole('row');
    // Header row plus exactly one data row — the superseded success and the
    // failure both collapse into it, not two rows.
    expect(rows).toHaveLength(2);
    expect(within(table).getByTitle(formatTimestamp(new Date(2_000)))).toBeInTheDocument();
  });
});

// `priceAlertTriggered` (issue #680) carries no scope at all — filtered out
// here rather than widening `db.tokens`' `scopes: string[]` to hold `undefined`.
const ALL_NOTIFICATION_SCOPES = [
  ...new Set(
    NOTIFICATION_EVENTS.map((event) => event.scope).filter(
      (scope): scope is Exclude<typeof scope, undefined> => scope !== undefined
    )
  ),
];
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
  // Notifications is a tab of its own now, so every query below has to open it
  // first — `fireEvent` rather than `userEvent` so this stays callable from the
  // tests that never set up a `user`.
  await screen.findByRole('heading', { level: 1, name: /settings/i });
  const tab = screen.getByRole('tab', { name: /^notifications$/i });
  if (tab.getAttribute('aria-selected') !== 'true') fireEvent.click(tab);
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
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const panel = await notificationsPanel();
    const pilotOneButton = await within(panel).findByRole('button', { name: /pilot one/i });
    const pilotTwoButton = within(panel).getByRole('button', { name: /pilot two/i });

    // The active character's section opens itself; every other one stays
    // collapsed. Awaited because the active id hydrates from Dexie a tick
    // after the panel first renders.
    await waitFor(() => expect(pilotOneButton).toHaveAttribute('aria-expanded', 'true'));
    expect(pilotTwoButton).toHaveAttribute('aria-expanded', 'false');

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
    await notificationsPanel();

    // No expand click: Pilot One is the active character, so its section is
    // already open.
    const mailCheckbox = await screen.findByRole('checkbox', {
      name: 'New Mail, browser notifications',
    });
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
    render(<App />);
    await notificationsPanel();

    expect(
      await screen.findByRole('checkbox', {
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
    await notificationsPanel();
    await screen.findByRole('checkbox', { name: 'Skill Level Complete, browser notifications' });

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
    await notificationsPanel();

    await user.click(await screen.findByRole('checkbox', { name: /enable notifications/i }));

    expect((await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))?.value).toMatchObject({
      masterEnabled: false,
    });
  });

  it('shows a blocked notice and disables only the browser controls while permission is denied', async () => {
    stubNotification('denied');
    render(<App />);
    await notificationsPanel();

    expect(await screen.findByText(/notifications are blocked/i)).toBeInTheDocument();
    // JS cannot re-request a denied grant, so nothing that would need one is offered.
    expect(
      screen.queryByRole('button', { name: /turn on browser notifications/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Browser notifications' })).toBeDisabled();

    // ...but the Overview feed works with no grant at all, so its controls stay live.
    expect(screen.getByRole('checkbox', { name: 'Enable notifications' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Overview notifications' })).toBeEnabled();

    expect(await screen.findByRole('checkbox', { name: 'New Mail, Overview list' })).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: 'New Mail, browser notifications' })
    ).toBeDisabled();
  });

  it('offers an Enable button that makes the browser request, and no request without it', async () => {
    const requestPermission = stubNotification('default');
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();

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
    render(<App />);
    await notificationsPanel();

    // Re-queried on every attempt rather than `expect(await findBy...)`, which
    // captures a node once and then asserts it is still attached. The panel
    // reads `characters` and `tokens` as two independent `useLiveQuery` calls
    // and renders as soon as the first resolves, so the row this finds can be
    // rebuilt when the second lands — detaching the captured node between the
    // `await` and the assertion, and failing as "element could not be found in
    // the document" a couple of hundred ms in rather than on a timeout.
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'New Mail, browser notifications' })
      ).toBeInTheDocument()
    );
    expect(screen.queryByText(/notifications are blocked/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /turn on browser notifications/i })
    ).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("disables a row and shows a reauth hint for a character missing that event's ESI scope", async () => {
    const user = userEvent.setup();
    render(<App />);
    // Pilot Two is not the active character, so its section still needs opening.
    const pilotTwoButton = await within(await notificationsPanel()).findByRole('button', {
      name: /pilot two/i,
    });
    await user.click(pilotTwoButton);

    // Scoped to Pilot Two's own section: Pilot One's is open too (it is the
    // active character), so every row name now appears twice on the page.
    const pilotTwoSection = within(pilotTwoButton.closest('div')!.parentElement!);
    const mailCheckbox = pilotTwoSection.getByRole('checkbox', {
      name: 'New Mail, browser notifications',
    });
    expect(mailCheckbox).toBeDisabled();
    // A disabled control can't take focus, so the tooltip only reveals on
    // hover — a real pointermove, not the click above.
    fireEvent.pointerMove(mailCheckbox);
    expect(await screen.findByText(/re-authorize the character/i)).toBeInTheDocument();

    expect(
      pilotTwoSection.getByRole('checkbox', {
        name: 'Skill Level Complete, browser notifications',
      })
    ).not.toBeDisabled();
  });

  it('search filters rows by event-type name across every character section', async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();

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
    await notificationsPanel();

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

  it("lands on the Notifications tab when the Overview feed's link names it", async () => {
    // The feed links to /settings#notifications. That used to resolve by
    // scrolling within the default tab; the section is a tab of its own now,
    // so the hash has to select it or the link goes nowhere.
    window.history.pushState({}, '', '/settings#notifications');
    render(<App />);

    expect(await screen.findByRole('tab', { name: /^notifications$/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(await screen.findByRole('heading', { name: /^notifications$/i })).toBeInTheDocument();
  });

  it('opens the FAQ tab and shows what the app stores', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /^faq$/i);

    expect(await screen.findByRole('heading', { name: /what we store/i })).toBeInTheDocument();
    // The groups, not just the panel title: the tab is worth nothing if it
    // renders a heading over an empty body.
    expect(
      screen.getByRole('heading', { name: /synced between your devices/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /kept on this device only/i })).toBeInTheDocument();

    // The tab carries all three questions, not just the first.
    expect(
      screen.getByRole('heading', { name: /report a bug or ask for a feature/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /someone i can thank/i })).toBeInTheDocument();
  });

  it('lands on the FAQ tab from /settings#faq', async () => {
    // The link to hand someone who asks what the app stores, from outside the
    // app. Same hash-selects-a-tab path #notifications uses above.
    window.history.pushState({}, '', '/settings#faq');
    render(<App />);

    expect(await screen.findByRole('tab', { name: /^faq$/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(await screen.findByRole('heading', { name: /what we store/i })).toBeInTheDocument();
  });

  it("names EVE's own notification types in words, not in ESI's CamelCase", async () => {
    render(<App />);
    await notificationsPanel();

    // Pilot One's section opens itself, and it holds every scope, so the
    // per-type list under "EVE Notifications" is on screen already. Scoped to
    // Pilot One's own section (same pattern the search test above uses): the
    // "All Characters" master row (issue #745) repeats this same per-type
    // list above the real character list, so an unscoped query now matches
    // twice.
    const pilotOneSection = within(await notificationsPanel())
      .getByRole('button', { name: /pilot one/i })
      .closest('div')!.parentElement!;
    const panel = within(pilotOneSection);

    expect(await panel.findByText('Structure Under Attack')).toBeInTheDocument();
    expect(panel.getByText('Corporation Bill Issued')).toBeInTheDocument();
    // The two reinforcement types share a fired title ("Structure reinforced")
    // but are separately togglable rows, so they must read differently here.
    expect(panel.getByText('Structure Lost Shields')).toBeInTheDocument();
    expect(panel.getByText('Structure Lost Armor')).toBeInTheDocument();

    expect(panel.queryByText('StructureUnderAttack')).not.toBeInTheDocument();
    expect(panel.queryByText('CorpAllBillMsg')).not.toBeInTheDocument();
  });

  /**
   * The absence half is the point. A badge that says "arrives with the app
   * closed" is a promise, and the only events that can keep it are the ones
   * the backend can schedule ahead (`PROJECTABLE_EVENT_IDS`). `eveNotification`
   * is on that engine list for its reinforcement-exit sub-case alone, so a
   * badge on that row would make the promise for 25 types that cannot keep it
   * — which is what breaks if someone later drops the filter.
   */
  it('marks only the events that really arrive with the app closed', async () => {
    render(<App />);
    const panel = within(await notificationsPanel());

    const badgeName = /arrives even with the app closed/i;
    // The label and its badge are siblings inside one wrapper span, so the
    // label's parent is exactly the scope to ask about. The All Characters
    // master row (issue #738) repeats every event label above the real
    // character list, so `name` can now match twice — the last match is
    // always Pilot One's own row, since the master row renders first.
    await panel.findAllByText('Skill Level Complete');
    const rowFor = (name: string) => within(panel.getAllByText(name).at(-1)!.parentElement!);

    // Scheduled Push: a knowable future instant the backend can fire on.
    expect(
      rowFor('Skill Level Complete').getByRole('img', { name: badgeName })
    ).toBeInTheDocument();
    expect(
      rowFor('Planetary Extractor Expiring').getByRole('img', { name: badgeName })
    ).toBeInTheDocument();
    expect(rowFor('Structure Fuel Low').getByRole('img', { name: badgeName })).toBeInTheDocument();

    // Poll-only: nothing knows when these happen until they have happened.
    expect(rowFor('New Mail').queryByRole('img', { name: badgeName })).toBeNull();
    expect(rowFor('Contract Accepted').queryByRole('img', { name: badgeName })).toBeNull();
    expect(rowFor('Member Joined').queryByRole('img', { name: badgeName })).toBeNull();
    expect(rowFor('EVE Notifications').queryByRole('img', { name: badgeName })).toBeNull();
  });

  it('labels the two delivery columns with what each one does', async () => {
    render(<App />);
    const panel = within(await notificationsPanel());

    // "App" and "List" named neither the pop-up nor the page it lands on.
    // Scoped to the panel: the app's own nav has an "Overview" link, which
    // would satisfy an unscoped query whether or not the caption changed.
    expect((await panel.findAllByText(/^Browser$/)).length).toBeGreaterThan(0);
    expect(panel.getAllByText(/^Overview$/).length).toBeGreaterThan(0);
    expect(panel.queryByText(/^App$/)).not.toBeInTheDocument();
    expect(panel.queryByText(/^List$/)).not.toBeInTheDocument();
  });

  describe('All Characters master row (issue #738)', () => {
    it('shows a master row above the character list, with the same per-event checkboxes', async () => {
      render(<App />);
      const panel = within(await notificationsPanel());

      expect(await panel.findByText('All Characters')).toBeInTheDocument();
      expect(
        panel.getByRole('checkbox', {
          name: 'Skill Level Complete for every character, browser notifications',
        })
      ).toBeInTheDocument();
    });

    it('is checked when known Characters agree, indeterminate once they disagree', async () => {
      render(<App />);
      await notificationsPanel();

      const masterEventCheckbox = (await screen.findByRole('checkbox', {
        name: 'Skill Level Complete for every character, browser notifications',
      })) as HTMLInputElement;
      // Both Characters default to skillLevelComplete-browser on: agreement.
      expect(masterEventCheckbox.indeterminate).toBe(false);
      expect(masterEventCheckbox).toBeChecked();

      // Pilot Two disagrees on that event/channel — set directly on the
      // store rather than through Pilot Two's own row, which shares an
      // identical aria-label with Pilot One's once both are expanded.
      act(() => {
        useNotificationPreferences.setState({
          value: {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            perCharacter: { [CHAR_2_ID]: { skillLevelComplete: { browser: false } } },
          },
          hydrated: true,
        });
      });

      expect(masterEventCheckbox.indeterminate).toBe(true);
    });

    it("toggling one event's master checkbox writes that value to every known Character, even one whose own row is scope-disabled for it", async () => {
      const user = userEvent.setup();
      render(<App />);
      await notificationsPanel();

      // Pilot Two has every notification scope except New Mail's (outer
      // beforeEach) — its own New Mail row renders disabled, but the master
      // row is not scope-gated at all (issue #738: "every known Character").
      const newMailMaster = await screen.findByRole('checkbox', {
        name: 'New Mail for every character, browser notifications',
      });
      await user.click(newMailMaster);

      const stored = (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
        ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES;
      expect(stored.perCharacter[CHAR_ID]?.newMail).toMatchObject({ browser: false });
      expect(stored.perCharacter[CHAR_2_ID]?.newMail).toMatchObject({ browser: false });
    });

    it("the top select-all row broadcasts every event to every Character, same cascade as a Character's own select-all", async () => {
      const user = userEvent.setup();
      render(<App />);
      await notificationsPanel();

      // Wallet Balance Changed/Market Order Filled default browser-off while
      // the rest default browser-on (CONTEXT.md round 45) — the grid starts
      // partial, so the first click fills every event, every Character, on.
      const selectAllCharacters = await screen.findByRole('checkbox', {
        name: 'Toggle browser notifications for every character',
      });
      await user.click(selectAllCharacters);
      expect(
        screen.getByRole('checkbox', { name: 'Skill Level Complete, browser notifications' })
      ).toBeChecked();
      expect(
        screen.getByRole('checkbox', { name: 'Wallet Balance Changed, browser notifications' })
      ).toBeChecked();

      // Now fully on across the board — the next click clears it.
      await user.click(selectAllCharacters);
      expect(
        screen.getByRole('checkbox', { name: 'Skill Level Complete, browser notifications' })
      ).not.toBeChecked();
    });

    it("disables its browser column when the browser permission is denied, matching a Character's own row", async () => {
      stubNotification('denied');
      render(<App />);
      await notificationsPanel();

      const masterSelectAllBrowser = await screen.findByRole('checkbox', {
        name: 'Toggle browser notifications for every character',
      });
      expect(masterSelectAllBrowser).toBeDisabled();
      expect(
        screen.getByRole('checkbox', {
          name: 'Skill Level Complete for every character, browser notifications',
        })
      ).toBeDisabled();
      // The Overview column is unaffected — only browser is permission-gated.
      expect(
        screen.getByRole('checkbox', { name: 'Toggle Overview notifications for every character' })
      ).not.toBeDisabled();
    });

    it('never opens a native confirm dialog for a broadcast', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm');
      render(<App />);
      await notificationsPanel();

      const selectAllCharacters = await screen.findByRole('checkbox', {
        name: 'Toggle browser notifications for every character',
      });
      await user.click(selectAllCharacters);
      expect(confirmSpy).not.toHaveBeenCalled();
    });
  });
});

describe('Settings — Notifications virtualization (issue #740)', () => {
  const ROSTER_SIZE = 60;

  beforeEach(async () => {
    for (let i = 0; i < ROSTER_SIZE; i++) {
      const characterId = 1000 + i;
      await db.characters.put({
        characterId,
        name: `Pilot ${String(i).padStart(3, '0')}`,
        ownerHash: `oh-${i}`,
        addedAt: i,
      });
      await db.tokens.put({
        characterId,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Date.now() + 1000 * 60 * 60,
        scopes: ALL_NOTIFICATION_SCOPES,
      });
    }
    // The active character drives which section auto-expands.
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1000 });
  });

  it('a large roster mounts only a bounded slice of Character sections, not all of them', async () => {
    render(<App />);
    const panel = await notificationsPanel();
    await within(panel).findByText('Pilot 000');

    // Virtualized rows carry `data-index`; with a real ~600px test viewport
    // (vitest.setup.ts's `data-virtual-scroll-root` mock) and ~60 mostly
    // collapsed Characters, the mounted count should be a small fraction of
    // the roster — never all 60, which is exactly the bug this ticket fixes.
    const mountedRows = panel.querySelectorAll('[data-index]');
    expect(mountedRows.length).toBeGreaterThan(0);
    expect(mountedRows.length).toBeLessThan(ROSTER_SIZE / 2);
  });

  it("the active (auto-expanded) character's own controls still work in a large roster", async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = within(await notificationsPanel());
    await panel.findByText('Pilot 000');

    const mailCheckbox = await panel.findByRole('checkbox', {
      name: 'New Mail, browser notifications',
    });
    await user.click(mailCheckbox);
    expect(mailCheckbox).not.toBeChecked();
    expect(
      (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
        ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES
    ).toMatchObject({ perCharacter: { 1000: { newMail: { browser: false, feed: true } } } });
  });

  it('collapsed characters in a large roster still render no event rows', async () => {
    render(<App />);
    const panel = within(await notificationsPanel());
    await panel.findByText('Pilot 000');

    // Pilot 001 onward stay collapsed (only the active character auto-expands) —
    // none of their event checkboxes exist anywhere in the panel.
    expect(panel.queryByText('Pilot 059')).toBeNull(); // outside the mounted window entirely
    expect(
      panel.queryByRole('checkbox', { name: /Skill Level Complete, browser notifications/ })
    ).not.toBeNull(); // Pilot 000's own, present since it's expanded
  });

  it('search filtering still narrows the roster correctly with many characters', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = within(await notificationsPanel());
    await panel.findByText('Pilot 000');

    await user.type(panel.getByPlaceholderText('Search events or characters'), 'Pilot 007');
    expect(await panel.findByText('Pilot 007')).toBeInTheDocument();
    expect(panel.queryByText('Pilot 000')).toBeNull();
  });
});

describe('Settings defaults', () => {
  it('defaults the time format to local, and persists a switch to EVE time', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = screen.getByRole('group', { name: /time format/i });
    expect(group.querySelector('[aria-pressed="true"]')).toHaveTextContent(/my local time/i);

    await user.click(screen.getByRole('button', { name: /eve time/i }));

    await waitFor(async () => {
      expect((await db.settings.get(TIME_FORMAT_SETTING_KEY))?.value).toBe('eve');
    });
  });

  it('surfaces the trade hub that Market Browser already writes', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    // The point of the control: the key existed but was only reachable from
    // inside one panel of one page. `findBy`, because the panel withholds
    // every control until its stores have hydrated.
    expect(await screen.findByRole('combobox', { name: /default trade hub/i })).toHaveTextContent(
      /jita/i
    );
  });

  it('clamps the assumed ME into the range the engine accepts', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const input = await screen.findByLabelText(/assumed me/i);
    await user.clear(input);
    await user.type(input, '99');

    // The engine range-checks ME and throws outside 0..10, so the control
    // must never hand it a value it would reject.
    await waitFor(async () => {
      expect((await db.settings.get(ASSUMED_ME_SETTING_KEY))?.value).toBe(10);
    });
  });

  it('clamps the assumed TE into the range the engine accepts', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const input = await screen.findByLabelText(/assumed te/i);
    await user.clear(input);
    await user.type(input, '99');

    // TE researches twice as deep as ME — `engine/industry/time.ts` throws
    // outside 0..20, so 20 is the ceiling here, not ME's 10.
    await waitFor(async () => {
      expect((await db.settings.get(ASSUMED_TE_SETTING_KEY))?.value).toBe(20);
    });
  });

  it('shows the stored assumed TE on a cold load, not the default', async () => {
    await db.settings.put({ key: ASSUMED_TE_SETTING_KEY, value: 4 });
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByLabelText(/assumed te/i)).toHaveValue(4);
  });

  it('hides rig and tax for an NPC station, which fits neither', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByRole('combobox', { name: /default facility/i })).toHaveTextContent(
      /npc/i
    );
    expect(screen.queryByRole('group', { name: /rigs/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/facility tax/i)).not.toBeInTheDocument();
  });

  it('shows the stored values on a cold load, not the defaults', async () => {
    // /settings is deep-linkable and mounts none of the pages that hydrate
    // these stores, so it has to hydrate them itself.
    await db.settings.put({ key: ASSUMED_ME_SETTING_KEY, value: 7 });
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByLabelText(/assumed me/i)).toHaveValue(7);
  });

  it('never writes a default over a stored record it has not read yet', async () => {
    // The packed facility record makes an unhydrated read destructive, not
    // merely stale: changing one field spreads the rest, so an unhydrated
    // `{npcStation, none, null}` would wipe a stored rig level and tax.
    await db.settings.put({
      key: FACILITY_DEFAULTS_SETTING_KEY,
      value: { facility: 'azbel', rigLevel: 't2', facilityTaxPct: 5 },
    });
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByRole('group', { name: /rigs/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/facility tax/i)).toHaveValue(5);
    expect(await db.settings.get(FACILITY_DEFAULTS_SETTING_KEY)).toMatchObject({
      value: { facility: 'azbel', rigLevel: 't2', facilityTaxPct: 5 },
    });
  });

  it('reveals rig and tax once the default facility is a player structure', async () => {
    useFacilityDefaults.setState({
      value: { facility: 'azbel', rigFit: ['meT1', 'teT1', 'none'], facilityTaxPct: 2 },
      hydrated: true,
    });
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByRole('group', { name: /rigs/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/facility tax/i)).toHaveValue(2);
  });

  it('offers the PI expiring-soon window, defaulting to 24 hours', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = await screen.findByRole('group', { name: /extractor is expiring/i });
    expect(group.querySelector('[aria-pressed="true"]')).toHaveTextContent(/24 hours/i);
  });

  it('hides the corp inactivity policy from a character with no corp access', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    // Hide rather than lock, the same rule the corp nav follows — a setting
    // for a page you cannot open is noise.
    expect(screen.queryByRole('group', { name: /members go dark/i })).not.toBeInTheDocument();
  });

  it('offers the default character filter, defaulting to "This character" (issue #607)', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByRole('button', { name: 'This character' })).toBeInTheDocument();
  });

  it('persists a switch to "All characters"', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(await screen.findByRole('button', { name: 'This character' }));
    await user.click(await screen.findByRole('menuitem', { name: 'All characters' }));

    expect(await screen.findByRole('button', { name: 'All characters' })).toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.settings.get('sync.defaultCharacterFilter'))?.value).toBe('all');
    });
  });
});

describe('Reset saved view preferences', () => {
  it('clears every view-preference key and nothing else', async () => {
    const reloadSpy = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy });

    for (const key of VIEW_PREFERENCE_KEYS) {
      await db.settings.put({ key, value: 'something' });
    }
    // User-created content and the active character must survive.
    await db.settings.put({ key: 'overviewGroups', value: { groups: ['Mains'] } });
    await db.settings.put({ key: 'characters.starred', value: [CHAR_ID] });

    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /reset saved view preferences/i }));

    await waitFor(async () => {
      for (const key of VIEW_PREFERENCE_KEYS) {
        expect(await db.settings.get(key)).toBeUndefined();
      }
    });
    expect(await db.settings.get('overviewGroups')).toBeDefined();
    expect(await db.settings.get('characters.starred')).toBeDefined();
    expect(await db.settings.get(ACTIVE_CHARACTER_KEY)).toBeDefined();
  });
});
