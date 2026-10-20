import { SINGLE_KEY_SHORTCUTS_SETTING_KEY, useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';
import { describe, it, expect, beforeAll, beforeEach, afterEach, onTestFinished, vi } from 'vitest';
import { enableWebPush } from '@/features/notifications/webPush';
import { clearPushFailure, usePushFailure } from '@/features/notifications/pushFailure';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { AVOIDED_SYSTEMS_KEY, useAvoidedSystems } from '@/features/route/avoidedSystems';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale, FONT_SCALE_KEY, DEFAULT_FONT_SCALE } from '@/lib/fontScale';
import { useActivityLog } from '@/stores/activityLog';
import en from '@/i18n/locales/en.json';
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
import { isEventEnabledFor } from '@/features/notifications/eventSelection';
import { rebuildProjection } from '@/features/notifications/projectionRebuild';
import { PROJECTION_REBUILD_DELAY_MS } from '@/features/notifications/projectionRebuildScheduler';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import { PLAY_STORE_PACKAGE, androidNotificationSettingsUrl } from '@/lib/playStoreApp';
import { assignLocation } from '@/app/navigation';
import { consumeStaleStores } from '@/app/staleStoresReload';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeFormat, DEFAULT_TIME_FORMAT, TIME_FORMAT_SETTING_KEY } from '@/lib/timeFormat';
import {
  useCalendarWeekStart,
  DEFAULT_CALENDAR_WEEK_START,
  CALENDAR_WEEK_START_KEY,
} from '@/features/character/calendarWeekStart';
import { useMarketHub } from '@/features/market/hub';
import { useAssumedMe, ASSUMED_ME_SETTING_KEY } from '@/features/industry/assumedMe';
import { useAssumedTe, ASSUMED_TE_SETTING_KEY } from '@/features/industry/assumedTe';
import {
  useFacilityDefaults,
  DEFAULT_FACILITY_DEFAULTS,
  FACILITY_DEFAULTS_SETTING_KEY,
} from '@/features/industry/facilityDefaults';
import {
  useReactionFacilityDefaults,
  DEFAULT_REACTION_FACILITY_DEFAULTS,
} from '@/features/industry/reactionFacilityDefaults';
import { useExpiringWindowHours } from '@/features/pi/expiringWindow';
import { useDarkThreshold } from '@/features/corp/darkThreshold';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { VIEW_PREFERENCE_KEYS } from '@/lib/viewPreferenceKeys';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { forceUpdate } from '@/app/forceUpdate';
import { useUpdateStatus } from '@/app/updateAvailable';
import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import { DEFAULT_MOBILE_TABS, MOBILE_TABS_KEY, useMobileTabs } from '@/lib/mobileTabs';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/app/navigation', () => ({ assignLocation: vi.fn() }));
vi.mock('@/app/forceUpdate', () => ({ forceUpdate: vi.fn() }));
vi.mock('@/lib/serviceWorker', () => ({
  getServiceWorkerRegistration: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

vi.mock('@/features/notifications/projectionRebuild', () => ({
  rebuildProjection: vi.fn(async () => {}),
}));

/**
 * `ForegroundNotificationPoller` runs a poll shortly after every `<App/>`
 * mount (`FIRST_POLL_DELAY_MS`), and a poll that reaches its end unconditionally
 * calls `rebuildProjection` too (`foregroundPoller.ts`), independent of the
 * debounced scheduler below. Settings has nothing to do with the poller, so
 * the real thing here was cross-contaminating `rebuildProjection`'s call
 * count: it could still be mid-flight (real ESI/Dexie reads, not driven by
 * this file's fake timers) when a test's own preference write and its
 * mount's poll happened to both resolve inside the same assertion window,
 * landing an extra, unrelated call and flaking a call-count assertion
 * (issue #2065). Kept as a real `vi.fn()` (not a bare no-op) so a future
 * caller expecting to assert against it still can.
 */
vi.mock('@/features/notifications/foregroundPoller', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/notifications/foregroundPoller')>();
  return { ...actual, runForegroundPoll: vi.fn(async () => {}) };
});

vi.mock('@/features/notifications/webPush', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/notifications/webPush')>();
  return { ...actual, enableWebPush: vi.fn(actual.enableWebPush) };
});

/**
 * Same reasoning for the boot cache warm-up: it starts in the first idle slot
 * (`bootPrefetch.ts`; a 2 s timer under jsdom), which lands mid-test here and
 * re-renders the Notifications list under a click — the virtualized section
 * remounts and the click hits a detached checkbox. Settings reads nothing it
 * warms.
 */
vi.mock('@/app/bootPrefetch', () => ({
  scheduleBootPrefetch: () => () => {},
  scheduleCachePrune: () => () => {},
  scheduleLazySdeWarm: () => () => {},
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

/** Settings' own left rail, as opposed to the app's — both carry links named "Market", "Characters"... */
function settingsNav(): HTMLElement {
  return screen.getByRole('navigation', { name: /settings sections/i });
}

/** Opens one of Settings' sections from its rail. */
async function openTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await screen.findByRole('heading', { level: 1, name: /settings/i });
  await user.click(within(settingsNav()).getByRole('link', { name }));
}

beforeAll(async () => {
  // One throwaway render, so no test pays for the worker's first `App` render
  // (compiling the lazy Settings chunk, warming jsdom and React): it landed on
  // whichever test ran first and tipped its 1 s `findBy`. Under the hook's own budget.
  await routeChunks.loadSettings();
  // Signed out, the app shows the landing page instead of Settings.
  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/settings/display');
  const { unmount } = render(<App />);
  await screen.findByRole('heading', { level: 1, name: /settings/i }, { timeout: 25_000 });
  unmount();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
}, 30_000);

// Rendered through <App /> rather than in isolation: /settings has a nav
// entry now, so routing to it through the shell is part of what's asserted.
// Settings makes no requests, hence no msw server.
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useFontScale.setState({ value: DEFAULT_FONT_SCALE, hydrated: false });
  useSingleKeyShortcuts.setState({ value: true, hydrated: false });
  // Module-scope singletons: a value left over from a previous test would
  // make the assertions below pass or fail for the wrong reason.
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: false });
  useAvoidedSystems.setState({ value: [], hydrated: false });
  useCalendarWeekStart.setState({ value: DEFAULT_CALENDAR_WEEK_START, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  useAssumedMe.setState({ value: 0, hydrated: false });
  useAssumedTe.setState({ value: 0, hydrated: false });
  useFacilityDefaults.setState({ value: DEFAULT_FACILITY_DEFAULTS, hydrated: false });
  useReactionFacilityDefaults.setState({
    value: DEFAULT_REACTION_FACILITY_DEFAULTS,
    hydrated: false,
  });
  useExpiringWindowHours.setState({ value: 24, hydrated: false });
  useDarkThreshold.setState({ value: 30, hydrated: false });
  useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });
  useMobileTabs.setState({ value: DEFAULT_MOBILE_TABS, hydrated: false });
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: false });
  usePushFailure.setState({ value: null, hydrated: true });
  useNotificationPromptState.setState({
    value: { ...DEFAULT_NOTIFICATION_PROMPT_STATE, seen: true },
    hydrated: true,
  });
  document.documentElement.style.fontSize = '';

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  useActivityLog.setState({ entries: [] });
  // jsdom's matchMedia never matches, which reads as a phone — and a phone's
  // bare `/settings` is the section list. Most tests want a section.
  window.history.pushState({}, '', '/settings/display');
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

  it('lists the keyboard shortcuts on Help, its first tab, and redirects the old Settings link (issue #25)', async () => {
    window.history.pushState({}, '', '/settings/shortcuts');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /help & faq/i });

    expect(window.location.pathname).toBe('/help/shortcuts');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Shortcuts', 'FAQ', 'Support']);
    // The off switch lives in Settings › Display, not on Help.
    expect(
      screen.queryByRole('checkbox', { name: /single-key shortcuts/i })
    ).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByText('Open the command palette')).toBeInTheDocument();
    expect(screen.queryByText('Jump to search')).not.toBeInTheDocument();
    expect(screen.getByText('Switch character')).toBeInTheDocument();
    expect(screen.getByText('Open Settings')).toBeInTheDocument();
    expect(screen.getAllByText('then').length).toBeGreaterThan(0);
    expect(screen.getByText('Close the open dialog')).toBeInTheDocument();
  });

  it('turns the single-key shortcuts off from Display, on this device', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/display');
    render(<App />);
    const toggle = await screen.findByRole('checkbox', { name: /single-key shortcuts/i });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/single-key shortcuts are off/i)).toBeInTheDocument();
    expect((await db.settings.get(SINGLE_KEY_SHORTCUTS_SETTING_KEY))?.value).toBe(false);
  });

  it('shows an empty state when nothing has been fetched yet (issue #32)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /activity log/i);

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

    expect(screen.getByRole('button', { name: /clear log/i })).toHaveAttribute(
      'aria-disabled',
      'true'
    );

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
    // aria-disabled, not disabled: the pressed button keeps keyboard focus (issue #3365).
    expect(document.activeElement).toBe(clearButton);
    expect(clearButton).toHaveAttribute('aria-disabled', 'true');
  });

  it('clears cached ESI data on demand (issue #422)', async () => {
    const user = userEvent.setup();
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'skills',
      value: { total_sp: 1 },
      fetchedAt: 1,
    });
    window.history.pushState({}, '', '/settings/dataAge');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /clear cached esi data/i }));
    // Asks first: nothing is cleared until the dialog is confirmed.
    const dialog = await screen.findByRole('dialog', { name: /clear cached esi data\?/i });
    expect(await db.esiCache.count()).toBe(1);
    expect(within(dialog).queryByText(/only copy you have/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Clear cache' }));

    expect(await screen.findByText(/cache cleared/i)).toBeInTheDocument();
    expect(await db.esiCache.count()).toBe(0);
  });

  it('keeps cached ESI data when the clear is cancelled', async () => {
    const user = userEvent.setup();
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'skills',
      value: { total_sp: 1 },
      fetchedAt: 1,
    });
    window.history.pushState({}, '', '/settings/dataAge');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /clear cached esi data/i }));
    const dialog = await screen.findByRole('dialog', { name: /clear cached esi data\?/i });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(await db.esiCache.count()).toBe(1);
  });

  it('warns that the cache is the only copy when clearing it offline', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    onTestFinished(() => {
      Reflect.deleteProperty(navigator, 'onLine');
    });
    window.history.pushState({}, '', '/settings/dataAge');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /clear cached esi data/i }));
    const dialog = await screen.findByRole('dialog', { name: /clear cached esi data\?/i });

    expect(within(dialog).getByText(/only copy you have/i)).toBeInTheDocument();
  });

  it('Data Age tab shows an empty state when nothing has succeeded yet', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /^cached data$/i);

    expect(screen.getByRole('heading', { name: /data age/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing fetched yet/i)).toBeInTheDocument();
    // Nothing to fold, so no caret.
    expect(screen.queryByRole('button', { name: /show data age/i })).not.toBeInTheDocument();
  });

  it('Data Age tab lists only the latest successful fetch per endpoint/character, skipping failures (issue #32)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /^cached data$/i);

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

    // Folded by default: a one-line summary and the export menu, no table.
    expect(await screen.findByText(/1 source · last update/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /data age/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export data age/i })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /show data age/i }));

    const table = await screen.findByRole('table', { name: /data age/i });
    const rows = within(table).getAllByRole('row');
    // Header row plus exactly one data row — the superseded success and the
    // failure both collapse into it, not two rows.
    expect(rows).toHaveLength(2);
    const hint = within(rows[1]).getAllByRole('cell').at(-1)!.querySelector('[tabindex="0"]')!;
    await userEvent.setup().hover(hint);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(formatTimestamp(new Date(2_000)));
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
  // Notifications is a section of its own, so every query below has to open it
  // first — `fireEvent` rather than `userEvent` so this stays callable from the
  // tests that never set up a `user`.
  await screen.findByRole('heading', { level: 1, name: /settings/i });
  const link = within(settingsNav()).getByRole('link', { name: /^notifications$/i });
  if (link.getAttribute('aria-current') !== 'page') fireEvent.click(link);
  const hint = await screen.findByText(en.settings.notifications.hint);
  const section = hint.closest('section');
  if (!section) throw new Error('Notifications panel has no section wrapper');
  return section as HTMLElement;
}

/** One event's row-level checkbox: it speaks for every Character the event applies to. */
function rowCheckbox(event: string, channel: 'device' | 'Alerts') {
  return screen.getByRole('checkbox', {
    name: `${event} for every character, ${channel === 'device' ? 'device notifications' : 'Alerts list'}`,
  });
}

/**
 * Drills into a Topic. The test DOM reports a phone viewport, so Notifications
 * is a Topics list; a Topic opens on tap (the `topic` URL param) and shows only
 * its own rows, with an "All topics" button back. Returns to the list first when
 * another Topic is already open.
 */
async function openTopic(user: ReturnType<typeof userEvent.setup>, name: string) {
  const back = screen.queryByRole('button', { name: 'All topics' });
  if (back) await user.click(back);
  // Scoped to the list: the phone tab bar has its own "Skills" button.
  const list = await screen.findByRole('list', { name: 'Topics' });
  await user.click(within(list).getByRole('button', { name: new RegExp(`^${name}`) }));
  await screen.findByRole('button', { name: 'All topics' });
}

/**
 * Opens an event's row. The test DOM reports a phone viewport (no media query
 * matches), so a row opens as a bottom sheet; the inline desktop panel has its
 * own tests in `NotificationEventList.test.tsx`.
 */
async function openEvent(user: ReturnType<typeof userEvent.setup>, event: string) {
  await user.click(await screen.findByRole('button', { name: event }));
  return within(await screen.findByRole('dialog', { name: event }));
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
      // Every scope except New mail's — exercises the scope-gated disabled row.
      scopes: ALL_NOTIFICATION_SCOPES.filter((scope) => scope !== 'esi-mail.read_mail.v1'),
    });
  });

  it('lists every event once, each speaking for all characters, with the feed-only exceptions off for device', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    const panel = within(await notificationsPanel());
    await openTopic(user, 'Skills');

    await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());
    // One list, not one accordion per character.
    expect(panel.queryByRole('button', { name: /pilot one/i })).not.toBeInTheDocument();
    expect(panel.getAllByRole('checkbox', { name: /^Skill level complete/ })).toHaveLength(2);
    // Two characters, agreeing everywhere to start.
    expect(panel.getAllByText('All 2 alike').length).toBeGreaterThan(0);
    // marketOrderFilled/walletBalanceChanged default feed-on/browser-off
    // (GLOSSARY.md round 45) — worth a row, not worth an interruption.
    await openTopic(user, 'Market and contracts');
    expect(rowCheckbox('Wallet balance changed', 'device')).not.toBeChecked();
    expect(rowCheckbox('Wallet balance changed', 'Alerts')).toBeChecked();
    expect(rowCheckbox('Sell order filled', 'device')).not.toBeChecked();
    expect(rowCheckbox('Sell order filled', 'Alerts')).toBeChecked();
  });

  it('flips an event off for every character it applies to, then back on, persisting to Dexie', async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Mail and calendar');

    // Pilot Two has no Mail scope, so New mail applies to Pilot One alone.
    await waitFor(() => expect(rowCheckbox('New mail', 'device')).toBeChecked());
    await user.click(rowCheckbox('New mail', 'device'));
    await waitFor(() => expect(rowCheckbox('New mail', 'device')).not.toBeChecked());
    expect(
      (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
        ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES
    ).toEqual({
      masterEnabled: true,
      perCharacter: { [CHAR_ID]: { newMail: { browser: false, feed: true } } },
    });

    await user.click(rowCheckbox('New mail', 'device'));
    await waitFor(() => expect(rowCheckbox('New mail', 'device')).toBeChecked());
  });

  it('offers the extractor-expiring event on both channels and discloses the scheduled-push lead time', async () => {
    const user = userEvent.setup();
    // Issue #358: extractor-expiring moved from an app-open poll to a
    // scheduled push delivered up to 72 hours ahead; the disclosure text
    // must reflect that, not the old 5-minute poll wording.
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Industry and PI');

    await waitFor(() => {
      expect(rowCheckbox('Planetary extractor expiring', 'device')).toBeInTheDocument();
      expect(rowCheckbox('Planetary extractor expiring', 'Alerts')).toBeInTheDocument();
    });
    // On the row's face, whether or not the row is open.
    expect(screen.getByText(/delivered up to 72 hours ahead/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a row is indeterminate once characters disagree, and one click brings everyone to on', async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Skills');
    await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());

    act(() => {
      useNotificationPreferences.setState({
        value: {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          perCharacter: { [CHAR_2_ID]: { skillLevelComplete: { browser: false } } },
        },
        hydrated: true,
      });
    });
    const device = rowCheckbox('Skill level complete', 'device') as HTMLInputElement;
    await waitFor(() => expect(device.indeterminate).toBe(true));
    expect(screen.getAllByText('1 differs').length).toBeGreaterThan(0);

    // A disagreement fills in rather than clears: the same cascade the old All Characters row had.
    await user.click(device);
    await waitFor(() => expect(device).toBeChecked());
    expect(device.indeterminate).toBe(false);
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
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Mail and calendar');

    expect(await screen.findByText(/notifications are blocked/i)).toBeInTheDocument();
    // Android settings exist only behind the Play Store app's shell.
    expect(
      screen.queryByRole('button', { name: /open notification settings/i })
    ).not.toBeInTheDocument();
    // JS cannot re-request a denied grant, so nothing that would need one is offered.
    expect(
      screen.queryByRole('button', { name: /turn on device notifications/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Device pop-ups' })).toBeDisabled();

    // ...but the Overview feed works with no grant at all, so its controls stay live.
    expect(screen.getByRole('checkbox', { name: 'Enable notifications' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Alerts list' })).toBeEnabled();

    await waitFor(() => expect(rowCheckbox('New mail', 'Alerts')).toBeEnabled());
    expect(rowCheckbox('New mail', 'device')).toBeDisabled();
  });

  describe('in the Play Store app', () => {
    // In the TWA, Chrome delegates the grant to the Android app's own
    // notification toggle, so the fix lives in Android settings, not site settings.
    beforeEach(() => {
      vi.spyOn(document, 'referrer', 'get').mockReturnValue(`android-app://${PLAY_STORE_PACKAGE}`);
      vi.mocked(assignLocation).mockClear();
      onTestFinished(() => {
        vi.restoreAllMocks();
        window.sessionStorage.clear();
      });
    });

    it('opens Android notification settings from the blocked notice, never naming site settings', async () => {
      stubNotification('denied');
      const user = userEvent.setup();
      render(<App />);
      await notificationsPanel();

      expect(await screen.findByText(/notifications are off for this app/i)).toBeInTheDocument();
      expect(screen.queryByText(/site settings/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /open notification settings/i }));
      expect(assignLocation).toHaveBeenCalledWith(
        androidNotificationSettingsUrl(window.location.href)
      );
    });

    it('drops the notice and the button once the grant reads granted', async () => {
      stubNotification('granted');
      render(<App />);
      await notificationsPanel();

      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: 'Device pop-ups' })).toBeEnabled()
      );
      expect(
        screen.queryByRole('button', { name: /open notification settings/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/notifications are off for this app/i)).not.toBeInTheDocument();
    });

    it('clears the notice when the grant flips to granted while the page is open', async () => {
      // Back from Android settings: the page never reloads, it only regains focus.
      stubNotification('denied');
      render(<App />);
      await notificationsPanel();
      expect(await screen.findByText(/notifications are off for this app/i)).toBeInTheDocument();

      stubNotification('granted');
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() =>
        expect(screen.queryByText(/notifications are off for this app/i)).not.toBeInTheDocument()
      );
      expect(screen.getByRole('checkbox', { name: 'Device pop-ups' })).toBeEnabled();
    });
  });

  it('offers an Enable button that makes the browser request, and no request without it', async () => {
    const requestPermission = stubNotification('default');
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();

    const enable = await screen.findByRole('button', { name: /turn on device notifications/i });
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

  it('shows a Retry row for a stored push failure; Retry re-registers and clears it, toggles stay on (issue #2844)', async () => {
    const user = userEvent.setup();
    stubNotification('granted');
    usePushFailure.setState({ value: { reason: 'network', at: 1 }, hydrated: true });
    vi.mocked(enableWebPush).mockClear();
    vi.mocked(enableWebPush).mockImplementationOnce(async () => {
      await clearPushFailure();
      return { support: 'supported', permission: 'granted' };
    });
    render(<App />);
    await notificationsPanel();

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Device pop-ups' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(enableWebPush).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText(/couldn't reach the server/i)).not.toBeInTheDocument()
    );
  });

  it('shows no push failure row when nothing failed', async () => {
    stubNotification('granted');
    render(<App />);
    await notificationsPanel();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Device pop-ups' })).toBeEnabled()
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('never requests permission on its own when the grant is already settled', async () => {
    const requestPermission = stubNotification('granted');
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Mail and calendar');

    await waitFor(() => expect(rowCheckbox('New mail', 'device')).toBeInTheDocument());
    expect(screen.queryByText(/notifications are blocked/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /turn on device notifications/i })
    ).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("lists a character missing an event's ESI scope as unavailable, and says which Permission to grant (issue #1525)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Mail and calendar');
    const sheet = await openEvent(user, 'New mail');

    // Pilot Two stays listed, dimmed and aria-disabled, so the reason can be read.
    const pilotTwoMail = sheet.getByRole('checkbox', {
      name: 'New mail, Pilot Two, device notifications',
    });
    expect(pilotTwoMail).toHaveAttribute('aria-disabled', 'true');
    // Said on the row's face, so it is visible without opening anything.
    expect(screen.getByText(/1 character hasn't granted Mail/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage permissions' })).toBeInTheDocument();
    fireEvent.pointerMove(pilotTwoMail);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Needs the Mail permission');

    // Pilot One holds the scope, and other events are untouched for Pilot Two.
    expect(
      sheet.getByRole('checkbox', { name: 'New mail, Pilot One, device notifications' })
    ).not.toHaveAttribute('aria-disabled');
  });

  it('files events under named topics: skills, industry, market (price alert last), mail, corp, then EVE notifications last', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = within(await notificationsPanel());
    const topics = (await panel.findByRole('list', { name: 'Topics' })).textContent ?? '';
    const at = (text: string, label: string) => {
      const index = text.indexOf(label);
      expect(index, label).toBeGreaterThanOrEqual(0);
      return index;
    };

    expect(at(topics, 'Skills')).toBeLessThan(at(topics, 'Industry and PI'));
    expect(at(topics, 'Industry and PI')).toBeLessThan(at(topics, 'Market and contracts'));
    expect(at(topics, 'Market and contracts')).toBeLessThan(at(topics, 'Mail and calendar'));
    expect(at(topics, 'Mail and calendar')).toBeLessThan(at(topics, 'Corp'));
    expect(at(topics, 'Corp')).toBeLessThan(at(topics, 'EVE notifications'));

    await openTopic(user, 'Market and contracts');
    const market = (await panel.findByRole('heading', { name: 'Market and contracts' }))
      .parentElement!.textContent!;
    expect(at(market, 'Wallet balance changed')).toBeLessThan(at(market, 'Quickbar price alert'));

    await openTopic(user, 'Corp');
    const corp = (await panel.findByRole('heading', { name: 'Corp' })).parentElement!.textContent!;
    expect(at(corp, 'Best-effort')).toBeLessThan(at(corp, 'Structure fuel low'));
    expect(at(corp, 'Structure fuel low')).toBeLessThan(at(corp, 'Member joined'));
  });

  it('says once, on the corp event, that a character has not granted the Corporation permission', async () => {
    const corpScopes = new Set(
      NOTIFICATION_EVENTS.filter((event) => event.corpCapability !== undefined).map(
        (event) => event.scope
      )
    );
    await db.tokens.put({
      characterId: CHAR_2_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 1000 * 60 * 60,
      scopes: ALL_NOTIFICATION_SCOPES.filter((scope) => !corpScopes.has(scope)),
    });
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Corp');
    const sheet = await openEvent(user, 'Member joined');

    // Once, on the Corp topic, not on each of its five rows.
    expect(screen.getAllByText(/hasn't granted/)).toHaveLength(1);
    // The row is still listed for that character, and still disabled.
    expect(
      sheet.getByRole('checkbox', { name: 'Member joined, Pilot Two, device notifications' })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it("opens an event to its characters, and one character's checkbox changes only that character", async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Skills');
    const sheet = await openEvent(user, 'Skill level complete');

    await user.click(
      sheet.getByRole('checkbox', { name: 'Skill level complete, Pilot Two, device notifications' })
    );

    const stored = (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
      ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES;
    expect(stored.perCharacter[CHAR_2_ID]?.skillLevelComplete).toMatchObject({ browser: false });
    expect(stored.perCharacter[CHAR_ID]?.skillLevelComplete).toBeUndefined();
    // The row now says so, and the odd one out is named by the chip it sits in.
    await waitFor(() =>
      expect(
        (rowCheckbox('Skill level complete', 'device') as HTMLInputElement).indeterminate
      ).toBe(true)
    );
  });

  it('search narrows the list to events matching the name', async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();

    await user.type(await screen.findByRole('searchbox'), 'mail');

    await waitFor(() =>
      expect(
        screen.queryByRole('checkbox', {
          name: 'Skill level complete for every character, device notifications',
        })
      ).not.toBeInTheDocument()
    );
    expect(rowCheckbox('New mail', 'device')).toBeInTheDocument();
  });

  it('search by character name keeps every event and narrows an opened row to that character', async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();

    await user.type(await screen.findByRole('searchbox'), 'Two');

    await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeInTheDocument());
    const sheet = await openEvent(user, 'Skill level complete');
    expect(
      sheet.getByRole('checkbox', { name: 'Skill level complete, Pilot Two, device notifications' })
    ).toBeInTheDocument();
    expect(
      sheet.queryByRole('checkbox', {
        name: 'Skill level complete, Pilot One, device notifications',
      })
    ).not.toBeInTheDocument();
  });

  it('restores the search text from the URL on reload', async () => {
    window.history.pushState({}, '', '/settings/notifications?search=mail');
    render(<App />);
    await notificationsPanel();

    await waitFor(() => expect(rowCheckbox('New mail', 'device')).toBeInTheDocument());
    expect(
      screen.queryByRole('checkbox', {
        name: 'Skill level complete for every character, device notifications',
      })
    ).not.toBeInTheDocument();
  });

  it('writes typed search text to the URL once typing pauses, and leaves the default out', async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();

    await user.type(await screen.findByRole('searchbox'), 'mail');

    await waitFor(() => expect(window.location.search).toBe('?search=mail'));
  });

  it("lands on the Notifications tab when the Overview feed's link names it", async () => {
    // The feed links to /settings/notifications directly (ADR 0015: tab is a path segment).
    window.history.pushState({}, '', '/settings/notifications');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(
      await within(settingsNav()).findByRole('link', { name: /^notifications$/i })
    ).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText(en.settings.notifications.hint)).toBeInTheDocument();
  });

  it("names EVE's own notification types in words, not in ESI's CamelCase", async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'EVE notifications');

    const sheet = await openEvent(user, 'EVE notifications');

    expect(await sheet.findByText('Structure Under Attack')).toBeInTheDocument();
    expect(sheet.getByText('Corporation Bill Issued')).toBeInTheDocument();
    // The two reinforcement types share a fired title ("Structure reinforced")
    // but are separately togglable rows, so they must read differently here.
    expect(sheet.getByText('Structure Lost Shields')).toBeInTheDocument();
    expect(sheet.getByText('Structure Lost Armor')).toBeInTheDocument();

    expect(sheet.queryByText('StructureUnderAttack')).not.toBeInTheDocument();
    expect(sheet.queryByText('CorpAllBillMsg')).not.toBeInTheDocument();
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
    const user = userEvent.setup();
    render(<App />);
    const panel = within(await notificationsPanel());

    const badgeName = /arrives even with the app closed/i;
    // The label and its badge are siblings inside one wrapper span, so the
    // label's row is exactly the scope to ask about. Rows only render for the
    // open topic, so each is looked up after opening its own.
    const rowIn = async (topic: string, name: string) => {
      await openTopic(user, topic);
      await panel.findAllByText(name);
      // The EVE notifications event shares its name with its topic heading; the row is the one in a list item.
      return within(
        panel
          .getAllByText(name)
          .map((el) => el.closest('li'))
          .find((li) => li !== null)!
      );
    };

    // Scheduled Push: a knowable future instant the backend can fire on.
    expect(
      (await rowIn('Skills', 'Skill level complete')).getByRole('img', { name: badgeName })
    ).toBeInTheDocument();
    expect(
      (await rowIn('Skills', 'Clone jump ready')).getByRole('img', { name: badgeName })
    ).toBeInTheDocument();
    expect(
      (await rowIn('Industry and PI', 'Planetary extractor expiring')).getByRole('img', {
        name: badgeName,
      })
    ).toBeInTheDocument();
    expect(
      (await rowIn('Corp', 'Structure fuel low')).getByRole('img', { name: badgeName })
    ).toBeInTheDocument();

    // Poll-only: nothing knows when these happen until they have happened.
    expect(
      (await rowIn('Mail and calendar', 'New mail')).queryByRole('img', { name: badgeName })
    ).toBeNull();
    expect(
      (await rowIn('Market and contracts', 'Contract accepted')).queryByRole('img', {
        name: badgeName,
      })
    ).toBeNull();
    expect(
      (await rowIn('Corp', 'Member joined')).queryByRole('img', { name: badgeName })
    ).toBeNull();
    expect(
      (await rowIn('EVE notifications', 'EVE notifications')).queryByRole('img', {
        name: badgeName,
      })
    ).toBeNull();
  });

  it('labels the two delivery columns with what each one does', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = within(await notificationsPanel());
    await openTopic(user, 'Skills');

    // "App" and "List" named neither the pop-up nor the page it lands on.
    // Scoped to the panel: the app's own nav has an "Overview" link, which
    // would satisfy an unscoped query whether or not the caption changed.
    // "Browser" was wrong in the Play Store app, which has no browser in sight.
    expect((await panel.findAllByText(/^Device$/)).length).toBeGreaterThan(0);
    expect(panel.getAllByText(/^Alerts$/).length).toBeGreaterThan(0);
    // The header captions (md up) and the row's own captions (phone) agree.
    expect(panel.getByText('Warn ahead')).toBeInTheDocument();
    expect(panel.getByText('Characters')).toBeInTheDocument();
    const rowDevice = rowCheckbox('Skill level complete', 'device').closest('label')!;
    expect(within(rowDevice).getByText('Device')).toBeInTheDocument();
    const rowAlerts = rowCheckbox('Skill level complete', 'Alerts').closest('label')!;
    expect(within(rowAlerts).getByText('Alerts')).toBeInTheDocument();
    expect(panel.queryByText(/^Browser$/)).not.toBeInTheDocument();
    expect(panel.queryByText(/^App$/)).not.toBeInTheDocument();
    expect(panel.queryByText(/^List$/)).not.toBeInTheDocument();
  });

  describe('Row-level broadcast (issue #738, now the page itself)', () => {
    it('writes to every Character the event applies to, and skips one whose own scope is missing', async () => {
      const user = userEvent.setup();
      render(<App />);
      await notificationsPanel();
      await openTopic(user, 'Mail and calendar');

      // Pilot Two has every notification scope except New mail's (outer
      // beforeEach), so New mail applies to Pilot One alone.
      await waitFor(() => expect(rowCheckbox('New mail', 'device')).toBeChecked());
      await user.click(rowCheckbox('New mail', 'device'));

      await waitFor(async () => {
        const stored = (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
          ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES;
        expect(stored.perCharacter[CHAR_ID]?.newMail).toMatchObject({ browser: false });
        expect(stored.perCharacter[CHAR_2_ID]?.newMail).toBeUndefined();
      });
    });

    it('writes to every Character when all of them can use the event', async () => {
      const user = userEvent.setup();
      render(<App />);
      await notificationsPanel();
      await openTopic(user, 'Skills');
      await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());

      await user.click(rowCheckbox('Skill level complete', 'device'));

      await waitFor(async () => {
        const stored = (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
          ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES;
        expect(stored.perCharacter[CHAR_ID]?.skillLevelComplete).toMatchObject({ browser: false });
        expect(stored.perCharacter[CHAR_2_ID]?.skillLevelComplete).toMatchObject({
          browser: false,
        });
      });
    });

    it("disables the device column when the browser permission is denied, matching a Character's own row", async () => {
      stubNotification('denied');
      const user = userEvent.setup();
      render(<App />);
      await notificationsPanel();
      await openTopic(user, 'Skills');

      await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeDisabled());
      // The Alerts column is unaffected — only the device column is permission-gated.
      expect(rowCheckbox('Skill level complete', 'Alerts')).not.toBeDisabled();
    });

    it('never opens a native confirm dialog for a broadcast', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm');
      render(<App />);
      await notificationsPanel();
      await openTopic(user, 'Skills');
      await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());

      await user.click(rowCheckbox('Skill level complete', 'device'));
      expect(confirmSpy).not.toHaveBeenCalled();
    });
  });

  describe('Scheduled Push re-upload after a preference write (issue #1259)', () => {
    /**
     * Fake only the scheduler's timers, and only once the panel is up —
     * `shouldAdvanceTime` keeps Dexie and user-event's own waits moving.
     */
    async function renderPanelWithFakeTimers() {
      render(<App />);
      await notificationsPanel();
      await openTopic(userEvent.setup(), 'Skills');
      await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());
      // The scheduler is module state: let a rebuild an earlier test's
      // browser click queued (on real timers) land before counting.
      await act(
        () => new Promise((resolve) => setTimeout(resolve, PROJECTION_REBUILD_DELAY_MS + 50))
      );
      vi.mocked(rebuildProjection).mockClear();
      vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
      return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    }

    async function afterQuietPeriod() {
      await act(() => vi.advanceTimersByTimeAsync(PROJECTION_REBUILD_DELAY_MS));
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('turning a browser event on rebuilds once; an Overview-only toggle does not', async () => {
      const user = await renderPanelWithFakeTimers();

      await openTopic(user, 'Mail and calendar');
      await user.click(rowCheckbox('New mail', 'Alerts'));
      await afterQuietPeriod();
      expect(rebuildProjection).not.toHaveBeenCalled();

      // Wallet balance changed defaults browser-off (GLOSSARY.md round 45).
      await openTopic(user, 'Market and contracts');
      await user.click(rowCheckbox('Wallet balance changed', 'device'));
      await afterQuietPeriod();
      await waitFor(() => expect(rebuildProjection).toHaveBeenCalledTimes(1));
    });

    it('a row-level browser broadcast rebuilds once', async () => {
      const user = await renderPanelWithFakeTimers();

      await openTopic(user, 'Mail and calendar');
      await user.click(rowCheckbox('New mail', 'device'));
      await afterQuietPeriod();
      await waitFor(() => expect(rebuildProjection).toHaveBeenCalledTimes(1));
    });

    it('the master switch and browser gate each rebuild once; the Overview gate does not', async () => {
      const user = await renderPanelWithFakeTimers();

      await user.click(screen.getByRole('checkbox', { name: 'Alerts list' }));
      await afterQuietPeriod();
      expect(rebuildProjection).not.toHaveBeenCalled();

      await user.click(screen.getByRole('checkbox', { name: 'Device pop-ups' }));
      await afterQuietPeriod();
      await waitFor(() => expect(rebuildProjection).toHaveBeenCalledTimes(1));

      await user.click(screen.getByRole('checkbox', { name: 'Enable notifications' }));
      await afterQuietPeriod();
      await waitFor(() => expect(rebuildProjection).toHaveBeenCalledTimes(2));
    });

    it('several quick browser toggles share one rebuild, which sees the final preferences', async () => {
      const user = await renderPanelWithFakeTimers();
      // Read from Dexie, not the store: the rebuild must wait for the write.
      let seenAtRebuild: boolean | undefined;
      // Once only: a later test's leftover rebuild must not run this against a cleared Dexie.
      vi.mocked(rebuildProjection).mockImplementationOnce(async () => {
        const stored = (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
          ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES;
        seenAtRebuild = isEventEnabledFor(stored.perCharacter[CHAR_ID] ?? {}, 'newMail', 'browser');
      });

      await openTopic(user, 'Mail and calendar');
      const newMail = rowCheckbox('New mail', 'device');
      await user.click(newMail);
      await user.click(newMail);
      await user.click(newMail);
      await openTopic(user, 'Skills');
      await user.click(rowCheckbox('Skill level complete', 'device'));
      await afterQuietPeriod();

      await waitFor(() => expect(rebuildProjection).toHaveBeenCalledTimes(1));
      expect(seenAtRebuild).toBe(false);
    });
  });
});

describe('Settings — Notifications with twenty characters', () => {
  const ROSTER_SIZE = 20;

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
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 1000 });
  });

  it('shows one row per event, not one list per character', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = within(await notificationsPanel());
    await openTopic(user, 'Skills');
    await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());

    expect(panel.getAllByRole('checkbox', { name: /^Skill level complete/ })).toHaveLength(2);
    // The default fixture Character holds no notification scopes, so each row counts the 20 that can use it of the 21.
    expect(panel.getAllByText('20 of 21 can use this').length).toBeGreaterThan(0);
    // Nothing per character is mounted until a row is opened.
    expect(panel.queryByText('Pilot 007')).toBeNull();
  });

  it('opens a row to all twenty characters and fixes one of them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Skills');
    await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());
    const sheet = await openEvent(user, 'Skill level complete');

    expect(sheet.getAllByRole('listitem').length).toBeGreaterThanOrEqual(ROSTER_SIZE);
    await user.click(
      sheet.getByRole('checkbox', {
        name: 'Skill level complete, Pilot 007, device notifications',
      })
    );
    expect(
      (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
        ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES
    ).toMatchObject({ perCharacter: { 1007: { skillLevelComplete: { browser: false } } } });
    await waitFor(() => expect(screen.getAllByText('1 differs').length).toBeGreaterThan(0));
  });

  it('a row-level click writes to all twenty at once', async () => {
    const user = userEvent.setup();
    render(<App />);
    await notificationsPanel();
    await openTopic(user, 'Skills');
    await waitFor(() => expect(rowCheckbox('Skill level complete', 'Alerts')).toBeChecked());

    await user.click(rowCheckbox('Skill level complete', 'Alerts'));

    await waitFor(async () => {
      const stored = (await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))
        ?.value as typeof DEFAULT_NOTIFICATION_PREFERENCES;
      expect(Object.keys(stored.perCharacter)).toHaveLength(ROSTER_SIZE);
    });
  });

  it('search by one character narrows the opened row to just them', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = within(await notificationsPanel());
    await openTopic(user, 'Skills');
    await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());

    await user.type(panel.getByPlaceholderText('Search events or characters'), 'Pilot 007');
    const sheet = await openEvent(user, 'Skill level complete');
    expect(
      await sheet.findByRole('checkbox', {
        name: 'Skill level complete, Pilot 007, device notifications',
      })
    ).toBeInTheDocument();
    expect(sheet.queryByText('Pilot 000')).toBeNull();
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

  it('defaults the week start to Monday, and persists a switch to Sunday', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = await screen.findByRole('group', { name: /week starts on/i });
    expect(group.querySelector('[aria-pressed="true"]')).toHaveTextContent(/^monday$/i);

    await user.click(screen.getByRole('button', { name: /^sunday$/i }));

    await waitFor(async () => {
      expect((await db.settings.get(CALENDAR_WEEK_START_KEY))?.value).toBe('sunday');
    });
  });

  it('surfaces the trade hub that Market Browser already writes', async () => {
    window.history.pushState({}, '', '/settings/market');
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
    window.history.pushState({}, '', '/settings/industry');
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
    window.history.pushState({}, '', '/settings/industry');
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
    window.history.pushState({}, '', '/settings/industry');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByLabelText(/assumed te/i)).toHaveValue(4);
  });

  it('offers no facility defaults — a new plan starts where the last plan page set one', async () => {
    // Both records are remembered from Build Plan pages now; a stored one is
    // left exactly as it was, since the Settings page no longer reads it.
    const stored = { facility: 'azbel', rigLevel: 't2', facilityTaxPct: 5 };
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: stored });
    window.history.pushState({}, '', '/settings/industry');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByLabelText(/assumed me/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: /default manufacturing facility/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: /default reaction location/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/facility tax/i)).not.toBeInTheDocument();
    expect(await db.settings.get(FACILITY_DEFAULTS_SETTING_KEY)).toMatchObject({ value: stored });
  });

  it('shows the stored values on a cold load, not the defaults', async () => {
    // /settings is deep-linkable and mounts none of the pages that hydrate
    // these stores, so it has to hydrate them itself.
    await db.settings.put({ key: ASSUMED_ME_SETTING_KEY, value: 7 });
    window.history.pushState({}, '', '/settings/industry');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByLabelText(/assumed me/i)).toHaveValue(7);
  });

  it('sends the old /settings/faq link to the Help page’s FAQ questions', async () => {
    window.history.pushState({}, '', '/settings/faq');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /help & faq/i });

    expect(window.location.pathname).toBe('/help/faq');
    expect(
      await screen.findByRole('button', { name: /what syncs between my devices/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /what stays on this device/i })).toBeInTheDocument();
  });

  it('sends the old /settings/help link to the Help page’s Support tab', async () => {
    window.history.pushState({}, '', '/settings/help');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /help & faq/i });

    expect(window.location.pathname).toBe('/help/support');
    expect(screen.getByRole('tab', { name: 'Support' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'FAQ' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: /bugs, ideas and chat/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /discord/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /say thanks/i })).toBeInTheDocument();
  });

  it('renders the Offline data section at /settings/offline', async () => {
    window.history.pushState({}, '', '/settings/offline');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    expect(
      await within(settingsNav()).findByRole('link', { name: /offline data/i })
    ).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText(en.settings.offline.hint)).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Download everything for offline' })
    ).toBeInTheDocument();
  });

  it('shows the shortcut list from the ? shortcut, even from another section', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/activity');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    expect(
      await within(settingsNav()).findByRole('link', { name: /activity log/i })
    ).toHaveAttribute('aria-current', 'page');

    // The real `?` shortcut. It navigates to Help › Shortcuts.
    await user.keyboard('{Shift>}?{/Shift}');

    expect(await screen.findByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/help/shortcuts');
  });

  it('offers the PI expiring-soon window, defaulting to 24 hours', async () => {
    window.history.pushState({}, '', '/settings/pi');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = await screen.findByRole('group', { name: /extractor is expiring/i });
    expect(group.querySelector('[aria-pressed="true"]')).toHaveTextContent(/24 hours/i);
  });

  it('hides the corp inactivity policy from a character with no corp access', async () => {
    window.history.pushState({}, '', '/settings/corporation');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    // Hide rather than lock, the same rule the corp nav follows — a setting
    // for a page you cannot open is noise. The URL still resolves, to a note.
    expect(await screen.findByText(/appear once the active character/i)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /members go dark/i })).not.toBeInTheDocument();
    expect(
      within(settingsNav()).queryByRole('link', { name: /^corporation$/i })
    ).not.toBeInTheDocument();
  });

  it('offers the default character filter, defaulting to "This character" (issue #607)', async () => {
    window.history.pushState({}, '', '/settings/characters');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(
      await screen.findByRole('button', { name: 'Default characters shown: This character' })
    ).toBeInTheDocument();
  });

  it('persists a switch to "All characters"', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/characters');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(
      await screen.findByRole('button', { name: 'Default characters shown: This character' })
    );
    await user.click(await screen.findByRole('menuitemradio', { name: 'All characters' }));

    expect(
      await screen.findByRole('button', { name: 'Default characters shown: All characters' })
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.settings.get('sync.defaultCharacterFilter'))?.value).toBe('all');
    });
  });
});

describe('Reset saved view preferences', () => {
  it('clears every view-preference key and nothing else', async () => {
    // Not the bare `/settings`: `stubGlobal('location', ...)` below takes a
    // frozen snapshot of `window.location`, so the redirect `TabRoute` would
    // otherwise issue for a bare tabbed-page path can never resolve — the
    // snapshot's `pathname` never advances to the tab it redirected to.
    // Starting already on the tab path sidesteps that, and must happen
    // before the snapshot is taken.
    window.history.pushState({}, '', '/settings/dataAge');

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
    // The confirmation must stay readable: the reload waits for leaving Settings.
    expect(await screen.findByText('View preferences reset.')).toBeInTheDocument();
    expect(reloadSpy).not.toHaveBeenCalled();
    consumeStaleStores();
  });
});

describe('Settings — phone tab bar', () => {
  // `NARROW_QUERY` is `md`'s max-width form, so the suite's never-matching
  // `matchMedia` stub reads as a laptop; these tests need the phone.
  function setViewport(narrow: boolean): void {
    const real = window.matchMedia;
    window.matchMedia = (media: string) =>
      ({
        media,
        matches: narrow && media === NARROW_QUERY,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    onTestFinished(() => {
      window.matchMedia = real;
    });
  }

  it('is absent from Display at md and up, where there is no bottom bar', async () => {
    setViewport(false);
    window.history.pushState({}, '', '/settings/display');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await screen.findByText(/time format/i);
    expect(screen.queryByRole('heading', { name: /phone tab bar/i })).toBeNull();
  });

  it("writes the pilot's four, device-local and in the rail's order", async () => {
    setViewport(true);
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/display');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = await screen.findByRole('group', { name: /phone tab bar links/i });
    // Swap one out for one in: unpick Industry, pick Wallet.
    await user.click(within(group).getByRole('button', { name: /^industry$/i }));
    await user.click(within(group).getByRole('button', { name: /^wallet$/i }));

    await waitFor(async () => {
      expect((await db.settings.get(MOBILE_TABS_KEY))?.value).toEqual([
        '/overview',
        '/skills',
        '/market',
        '/wallet',
      ]);
    });
    // The key has no `sync.` prefix, which is what keeps it on this device.
    expect(MOBILE_TABS_KEY.startsWith('sync.')).toBe(false);
  });

  it('holds the old bar until a replacement is picked, so it is never short', async () => {
    setViewport(true);
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/display');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = await screen.findByRole('group', { name: /phone tab bar links/i });
    await user.click(within(group).getByRole('button', { name: /^skills$/i }));

    expect(screen.getByText(/3 of 4 picked/i)).toBeInTheDocument();
    // Nothing written yet: a three-item bar is not a bar.
    expect(await db.settings.get(MOBILE_TABS_KEY)).toBeUndefined();
  });

  it('goes inert at four rather than guessing which tab a fifth pick replaces', async () => {
    setViewport(true);
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/display');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = await screen.findByRole('group', { name: /phone tab bar links/i });
    const wallet = within(group).getByRole('button', { name: /^wallet$/i });
    // `aria-disabled`, not the native attribute: the chip has to stay
    // hoverable and focusable for its own explanation to be readable.
    expect(wallet).toHaveAttribute('aria-disabled', 'true');
    await user.click(wallet);
    expect(within(group).getByRole('button', { name: /^wallet$/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    // The click above left the pointer on the chip; leave and re-enter so the
    // tooltip sees a fresh pointer move rather than depending on timing.
    await user.unhover(wallet);
    await user.hover(wallet);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/the bar holds four/i);

    // A chosen one still unpicks — that is the way out of a full bar.
    await user.click(within(group).getByRole('button', { name: /^skills$/i }));
    expect(within(group).getByRole('button', { name: /^wallet$/i })).not.toHaveAttribute(
      'aria-disabled'
    );
  });

  it('puts the default four back', async () => {
    window.history.pushState({}, '', '/settings/display');
    await db.settings.put({
      key: MOBILE_TABS_KEY,
      value: ['/mail', '/wallet', '/overview', '/assets'],
    });
    setViewport(true);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = await screen.findByRole('group', { name: /phone tab bar links/i });
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: /^wallet$/i })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );

    await user.click(screen.getByRole('button', { name: /use the default four/i }));

    await waitFor(async () => {
      expect((await db.settings.get(MOBILE_TABS_KEY))?.value).toEqual([...DEFAULT_MOBILE_TABS]);
    });
  });
});

describe('Settings — sections rail', () => {
  it('files every section under a group heading, with no tab bar', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const nav = settingsNav();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual([
      'Display',
      'Notifications',
      'Industry',
      'Planetary Industry',
      'Market',
      'Moon mining tax',
      'Characters',
      // Corporation is absent: this character has no corp access.
      'Travel',
      'Permissions',
      'App & backup',
      'Log out & delete',
      'Cached data',
      'Offline data',
      'Activity log',
    ]);
    for (const group of ['Preferences', 'Defaults', 'Account & device', 'Data']) {
      expect(within(nav).getByText(group)).toBeInTheDocument();
    }
  });

  it('opens a section from its link and marks it current', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openTab(user, /^market$/i);

    expect(await screen.findByRole('combobox', { name: /default trade hub/i })).toBeInTheDocument();
    expect(within(settingsNav()).getByRole('link', { name: /^market$/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(window.location.pathname).toBe('/settings/market');
  });

  it('carries an old /settings/general#shortcuts link on to Help › Shortcuts', async () => {
    window.history.pushState({}, '', '/settings/general#shortcuts');
    render(<App />);

    expect(await screen.findByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/help/shortcuts');
  });

  it('carries an old #corp-access link on to the Permissions section', async () => {
    window.history.pushState({}, '', '/settings/general#corp-access');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/settings/permissions'));
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await waitFor(() =>
      expect(within(settingsNav()).getByRole('link', { name: /^permissions$/i })).toHaveAttribute(
        'aria-current',
        'page'
      )
    );
  });
});

/** `(min-width: 48rem)` matches (or not), as `md` up does. */
function stubViewport(desktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (media: string) =>
      ({
        matches: desktop && media === '(min-width: 48rem)',
        media,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  );
}

describe('Settings — phone list', () => {
  it('lists the sections at /settings, with a one-line summary where there is one', async () => {
    window.history.pushState({}, '', '/settings');
    stubViewport(false);
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: /settings sections/i });
    expect(window.location.pathname).toBe('/settings');
    for (const group of ['Preferences', 'Defaults', 'Account & device', 'Data']) {
      expect(within(nav).getByText(group)).toBeInTheDocument();
    }
    // Corporation is absent: this character has no corp access.
    expect(within(nav).queryByRole('link', { name: /corporation/i })).not.toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(14);
    expect(within(nav).getByRole('link', { name: /^display/i })).toHaveTextContent(
      /default text, my local time/i
    );
    expect(within(nav).getByRole('link', { name: /^industry/i })).toHaveTextContent(/ME 0, TE 0/);
    expect(within(nav).getByRole('link', { name: /^market/i })).toHaveTextContent(/jita/i);
    expect(within(nav).getByRole('link', { name: /^characters/i })).toHaveTextContent(
      /current character/i
    );
    expect(within(nav).getByRole('link', { name: /^travel/i })).toHaveTextContent(
      /0 avoided systems/i
    );
    // Log out lives in its own section, with no summary line.
    expect(within(nav).getByRole('link', { name: /^log out & delete$/i })).toBeInTheDocument();
  });

  it('counts the stored Avoided Systems on the Travel row', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_KEY, value: [30045328, 30002813] });
    window.history.pushState({}, '', '/settings');
    stubViewport(false);
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: /settings sections/i });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: /^travel/i })).toHaveTextContent(
        /2 avoided systems/i
      )
    );
  });

  it('opens a section from its row, and the back link returns to the list', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings');
    stubViewport(false);
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: /settings sections/i });
    await user.click(within(nav).getByRole('link', { name: /^market/i }));
    expect(await screen.findByRole('combobox', { name: /default trade hub/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings/market');

    const back = screen
      .getAllByRole('link', { name: /settings/i })
      .find(
        (link) => link.getAttribute('href') === '/settings' && /‹/.test(link.textContent ?? '')
      );
    await user.click(back!);
    expect(
      await screen.findByRole('navigation', { name: /settings sections/i })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings');
  });

  it('still lands an old #shortcuts link on Shortcuts rather than the list', async () => {
    window.history.pushState({}, '', '/settings#shortcuts');
    stubViewport(false);
    render(<App />);

    expect(await screen.findByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/help/shortcuts');
  });

  it('keeps redirecting /settings to Display from md up', async () => {
    window.history.pushState({}, '', '/settings');
    stubViewport(true);
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/settings/display'));
    expect(await screen.findByRole('group', { name: /text size/i })).toBeInTheDocument();
  });
});

describe('Settings — This device', () => {
  it('logs out of every character, keeps the settings, and lands on the login page', async () => {
    const user = userEvent.setup();
    await db.characters.put({ characterId: 92, name: 'Pilot Two', ownerHash: 'oh2', addedAt: 2 });
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 1000,
      scopes: [],
    });
    await db.settings.put({ key: ASSUMED_ME_SETTING_KEY, value: 7 });
    window.history.pushState({}, '', '/settings/device');
    render(<App />);

    expect(
      await screen.findByText(/2 characters are logged in on this device/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^log out…$/i }));
    const dialog = await screen.findByRole('dialog', { name: /log out of all characters/i });
    expect(within(dialog).getByText(/removes 2 characters' logins/i)).toBeInTheDocument();
    // Nothing happens until the dialog is confirmed.
    expect(await db.characters.count()).toBe(2);

    await user.click(within(dialog).getByRole('button', { name: /^log out$/i }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(await db.characters.count()).toBe(0);
    expect(await db.tokens.count()).toBe(0);
    expect((await db.settings.get(ASSUMED_ME_SETTING_KEY))?.value).toBe(7);
  });

  it('leaves everything in place when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/device');
    render(<App />);

    // Disabled until the live character count resolves.
    const logOut = await screen.findByRole('button', { name: /^log out…$/i });
    await waitFor(() => expect(logOut).toBeEnabled());
    await user.click(logOut);
    const dialog = await screen.findByRole('dialog', { name: /log out of all characters/i });
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await db.characters.count()).toBe(1);
  });
});

describe('Settings — review follow-ups', () => {
  it('keeps the dialog open and says so when logging out fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(db.characters, 'delete').mockRejectedValueOnce(new Error('disk full'));
    window.history.pushState({}, '', '/settings/device');
    render(<App />);

    // Disabled until the live character count resolves.
    const logOut = await screen.findByRole('button', { name: /^log out…$/i });
    await waitFor(() => expect(logOut).toBeEnabled());
    await user.click(logOut);
    const dialog = await screen.findByRole('dialog', { name: /log out of all characters/i });
    await user.click(within(dialog).getByRole('button', { name: /^log out$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/could not log out/i);
    expect(await db.characters.count()).toBe(1);
  });

  it('ignores a hash that only names an inherited object member', async () => {
    window.history.pushState({}, '', '/settings/market#constructor');
    render(<App />);

    expect(await screen.findByRole('combobox', { name: /default trade hub/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings/market');
  });

  it('does not show the CCP data credit on Cached data', async () => {
    window.history.pushState({}, '', '/settings/dataAge');
    render(<App />);

    expect(
      await screen.findByRole('button', { name: /clear cached esi data/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /data credit/i })).not.toBeInTheDocument();
  });

  it('gives both backup password inputs a visible <label for>', async () => {
    window.history.pushState({}, '', '/settings/app');
    const { container } = render(<App />);

    const inputs = await screen.findAllByLabelText('Password');
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input.id).not.toBe('');
      expect(container.querySelector(`label[for="${input.id}"]`)).toBeInTheDocument();
    }
  });
});

describe('Settings — update state', () => {
  function registration(over: Record<string, unknown> = {}) {
    return Object.assign(new EventTarget(), {
      waiting: null,
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      ...over,
    });
  }
  function serviceWorker(reg: ReturnType<typeof registration>) {
    vi.mocked(getServiceWorkerRegistration).mockResolvedValue(reg as never);
  }

  beforeEach(() => {
    useUpdateStatus.setState({ status: 'unknown' });
    vi.mocked(forceUpdate).mockReset();
  });
  afterEach(() => {
    vi.mocked(getServiceWorkerRegistration).mockResolvedValue(undefined);
  });

  it('phone index: a waiting build highlights the row and Update now applies it', async () => {
    window.history.pushState({}, '', '/settings');
    stubViewport(false);
    serviceWorker(registration({ waiting: {} }));
    vi.mocked(forceUpdate).mockResolvedValue('failed');
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: /settings sections/i });
    const row = await within(nav).findByRole('link', { name: /^app & backup/i });
    expect(row).toHaveTextContent('Update available');
    expect(screen.queryAllByText('Checking for updates…')).toHaveLength(0);
    await userEvent.click(within(nav).getByRole('button', { name: 'Update now' }));
    expect(forceUpdate).toHaveBeenCalledOnce();
    expect(await within(nav).findByRole('alert')).toHaveTextContent(/could not check/i);
  });

  it('phone index: checking, then no updates', async () => {
    window.history.pushState({}, '', '/settings');
    stubViewport(false);
    let finish!: () => void;
    const reg = registration({ update: vi.fn(() => new Promise<void>((r) => (finish = r))) });
    serviceWorker(reg);
    render(<App />);

    expect((await screen.findAllByText('Checking for updates…')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument();
    finish();
    expect((await screen.findAllByText('No updates at this time')).length).toBeGreaterThan(0);
  });

  it("phone index: says so when the check can't run", async () => {
    window.history.pushState({}, '', '/settings');
    stubViewport(false);
    serviceWorker(registration({ update: vi.fn().mockRejectedValue(new Error('offline')) }));
    render(<App />);
    expect((await screen.findAllByText("Offline, couldn't check")).length).toBeGreaterThan(0);
  });

  it('checks once per visit, from any URL, and not when moving between sections', async () => {
    window.history.pushState({}, '', '/settings/industry');
    const reg = registration();
    serviceWorker(reg);
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await waitFor(() => expect(useUpdateStatus.getState().status).toBe('current'));
    expect(reg.update).toHaveBeenCalledTimes(1);

    await userEvent.click(within(settingsNav()).getByRole('link', { name: /^display/i }));
    await userEvent.click(within(settingsNav()).getByRole('link', { name: /^app & backup/i }));
    await screen.findAllByText('No updates at this time');
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  it('rail dot and the App & backup line follow the state', async () => {
    window.history.pushState({}, '', '/settings/app');
    serviceWorker(registration({ waiting: {} }));
    render(<App />);

    await screen.findByRole('heading', { level: 1, name: /settings/i });
    const nav = settingsNav();
    expect(await within(nav).findByRole('img', { name: 'Update available' })).toBeInTheDocument();
    const panel = screen.getByText('Update available', { selector: 'p' });
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();

    act(() => useUpdateStatus.setState({ status: 'current' }));
    expect(within(nav).queryByRole('img', { name: 'Update available' })).not.toBeInTheDocument();
    expect(panel).toHaveTextContent('No updates at this time');
  });
});
