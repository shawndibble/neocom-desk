import { SINGLE_KEY_SHORTCUTS_SETTING_KEY } from '@/lib/singleKeyShortcuts';
import { describe, it, expect, beforeEach, afterEach, onTestFinished, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { AVOIDED_SYSTEMS_KEY } from '@/features/route/avoidedSystems';
import { ACTIVE_CHARACTER_KEY } from '@/stores/activeCharacter';
import { FONT_SCALE_KEY } from '@/lib/fontScale';
import { useActivityLog } from '@/stores/activityLog';
import en from '@/i18n/locales/en.json';
import { stubViewport } from '@/test/viewport';
import { MD_UP_QUERY } from '@/lib/useMediaQuery';
import { consumeStaleStores } from '@/app/staleStoresReload';
import { formatTimestamp } from '@/lib/timestamp';
import { TIME_FORMAT_SETTING_KEY } from '@/lib/timeFormat';
import { CALENDAR_WEEK_START_KEY } from '@/features/character/calendarWeekStart';
import { ASSUMED_ME_SETTING_KEY } from '@/features/industry/assumedMe';
import { ASSUMED_TE_SETTING_KEY } from '@/features/industry/assumedTe';
import { FACILITY_DEFAULTS_SETTING_KEY } from '@/features/industry/facilityDefaults';
import { VIEW_PREFERENCE_KEYS } from '@/lib/viewPreferenceKeys';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { forceUpdate } from '@/app/forceUpdate';
import { useUpdateStatus } from '@/app/updateAvailable';
import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import { DEFAULT_MOBILE_TABS, MOBILE_TABS_KEY } from '@/lib/mobileTabs';
import {
  CHAR_ID,
  openTab,
  renderSettingsPage,
  settingsNav,
  installSettingsHarness,
} from '@/test/settingsPage';

vi.mock('@/app/navigation', async () => (await import('@/test/settingsMocks')).navigationMock());
vi.mock('@/app/forceUpdate', async () => (await import('@/test/settingsMocks')).forceUpdateMock());
vi.mock('@/lib/serviceWorker', async () =>
  (await import('@/test/settingsMocks')).serviceWorkerMock()
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/settingsMocks')).loadSdeMock());
vi.mock('@/features/notifications/projectionRebuild', async () =>
  (await import('@/test/settingsMocks')).projectionRebuildMock()
);
vi.mock('@/features/notifications/webPush', async (importOriginal) =>
  (await import('@/test/settingsMocks')).webPushMock(
    await importOriginal<typeof import('@/features/notifications/webPush')>()
  )
);

installSettingsHarness();

describe('Settings', () => {
  it('renders the page heading and the font-scale control, defaulting to 100%', async () => {
    renderSettingsPage();
    expect(await screen.findByRole('heading', { level: 1, name: /settings/i })).toBeInTheDocument();

    const group = screen.getByRole('group', { name: /text size/i });
    expect(group.querySelector('[aria-pressed="true"]')).toHaveTextContent(/default/i);
  });

  it('applies and persists the chosen scale immediately', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /^large$/i }));

    expect(screen.getByRole('button', { name: /^large$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(document.documentElement.style.fontSize).toBe('112.5%');
    expect((await db.settings.get(FONT_SCALE_KEY))?.value).toBe(1.125);
  });

  it('turns the single-key shortcuts off from Display, on this device', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/display');
    renderSettingsPage();
    const toggle = await screen.findByRole('checkbox', { name: /single-key shortcuts/i });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/single-key shortcuts are off/i)).toBeInTheDocument();
    expect((await db.settings.get(SINGLE_KEY_SHORTCUTS_SETTING_KEY))?.value).toBe(false);
  });

  it('shows an empty state when nothing has been fetched yet (issue #32)', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
    await openTab(user, /activity log/i);

    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });

  it('lists a recorded entry by route template, character name, and outcome (issue #32)', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /clear cached eve data/i }));
    // Asks first: nothing is cleared until the dialog is confirmed.
    const dialog = await screen.findByRole('dialog', { name: /clear cached eve data\?/i });
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
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /clear cached eve data/i }));
    const dialog = await screen.findByRole('dialog', { name: /clear cached eve data\?/i });
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
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    await user.click(screen.getByRole('button', { name: /clear cached eve data/i }));
    const dialog = await screen.findByRole('dialog', { name: /clear cached eve data\?/i });

    expect(within(dialog).getByText(/only copy you have/i)).toBeInTheDocument();
  });

  it('Data Age tab shows an empty state when nothing has succeeded yet', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
    await openTab(user, /^cached data$/i);

    expect(screen.getByRole('heading', { name: /data age/i })).toBeInTheDocument();
    expect(screen.getByText(/no data loaded yet/i)).toBeInTheDocument();
    // Nothing to fold, so no caret.
    expect(screen.queryByRole('button', { name: /show data age/i })).not.toBeInTheDocument();
  });

  it('Data Age tab lists only the latest successful fetch per endpoint/character, skipping failures (issue #32)', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
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

describe('Settings defaults', () => {
  it('defaults the time format to local, and persists a switch to EVE time', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    // The point of the control: the key existed but was only reachable from
    // inside one panel of one page. `findBy`, because the panel withholds
    // every control until its stores have hydrated.
    expect(await screen.findByRole('combobox', { name: /^trade hub$/i })).toHaveTextContent(
      /jita/i
    );
  });

  it('clamps the assumed ME into the range the engine accepts', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/industry');
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByLabelText(/assumed te/i)).toHaveValue(4);
  });

  it('offers no facility defaults — a new plan starts where the last plan page set one', async () => {
    // Both records are remembered from Build Plan pages now; a stored one is
    // left exactly as it was, since the Settings page no longer reads it.
    const stored = { facility: 'azbel', rigLevel: 't2', facilityTaxPct: 5 };
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: stored });
    window.history.pushState({}, '', '/settings/industry');
    renderSettingsPage();
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
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(await screen.findByLabelText(/assumed me/i)).toHaveValue(7);
  });

  it('renders the Offline data section at /settings/offline', async () => {
    window.history.pushState({}, '', '/settings/offline');
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    expect(
      await within(settingsNav()).findByRole('link', { name: /offline data/i })
    ).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText(en.settings.offline.hint)).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Download everything for offline' })
    ).toBeInTheDocument();
  });

  it('offers the PI expiring-soon window, defaulting to 24 hours', async () => {
    window.history.pushState({}, '', '/settings/pi');
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = await screen.findByRole('group', { name: /extractor is expiring/i });
    expect(group.querySelector('[aria-pressed="true"]')).toHaveTextContent(/24 hours/i);
  });

  it('hides the corp inactivity policy from a character with no corp access', async () => {
    window.history.pushState({}, '', '/settings/corporation');
    renderSettingsPage();
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
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(
      await screen.findByRole('button', { name: 'Default characters shown: This character' })
    ).toBeInTheDocument();
  });

  it('persists a switch to "All characters"', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/characters');
    renderSettingsPage();
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
    renderSettingsPage();
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
  it('is absent from Display at md and up, where there is no bottom bar', async () => {
    window.history.pushState({}, '', '/settings/display');
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await screen.findByText(/time format/i);
    expect(screen.queryByRole('heading', { name: /phone tab bar/i })).toBeNull();
  });

  it("writes the pilot's four, device-local and in the rail's order", async () => {
    stubViewport(NARROW_QUERY);
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/display');
    renderSettingsPage();
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
    stubViewport(NARROW_QUERY);
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/display');
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    const group = await screen.findByRole('group', { name: /phone tab bar links/i });
    await user.click(within(group).getByRole('button', { name: /^skills$/i }));

    expect(screen.getByText(/3 of 4 picked/i)).toBeInTheDocument();
    // Nothing written yet: a three-item bar is not a bar.
    expect(await db.settings.get(MOBILE_TABS_KEY)).toBeUndefined();
  });

  it('goes inert at four rather than guessing which tab a fifth pick replaces', async () => {
    stubViewport(NARROW_QUERY);
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/display');
    renderSettingsPage();
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
    stubViewport(NARROW_QUERY);
    const user = userEvent.setup();
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
    await openTab(user, /^market$/i);

    expect(await screen.findByRole('combobox', { name: /^trade hub$/i })).toBeInTheDocument();
    expect(within(settingsNav()).getByRole('link', { name: /^market$/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(window.location.pathname).toBe('/settings/market');
  });

  it('carries an old #corp-access link on to the Permissions section', async () => {
    window.history.pushState({}, '', '/settings/general#corp-access');
    renderSettingsPage();

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

describe('Settings — phone list', () => {
  it('lists the sections at /settings, with a one-line summary where there is one', async () => {
    window.history.pushState({}, '', '/settings');
    renderSettingsPage();

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
    renderSettingsPage();

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
    renderSettingsPage();

    const nav = await screen.findByRole('navigation', { name: /settings sections/i });
    await user.click(within(nav).getByRole('link', { name: /^market/i }));
    expect(await screen.findByRole('combobox', { name: /^trade hub$/i })).toBeInTheDocument();
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

  it('keeps redirecting /settings to Display from md up', async () => {
    window.history.pushState({}, '', '/settings');
    stubViewport(MD_UP_QUERY);
    renderSettingsPage();

    await waitFor(() => expect(window.location.pathname).toBe('/settings/display'));
    expect(await screen.findByRole('group', { name: /text size/i })).toBeInTheDocument();
  });
});

describe('Settings — This device', () => {
  it('leaves everything in place when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/device');
    renderSettingsPage();

    // Disabled until the live character count resolves.
    const logOut = await screen.findByRole('button', { name: /^log out$/i });
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
    renderSettingsPage();

    // Disabled until the live character count resolves.
    const logOut = await screen.findByRole('button', { name: /^log out$/i });
    await waitFor(() => expect(logOut).toBeEnabled());
    await user.click(logOut);
    const dialog = await screen.findByRole('dialog', { name: /log out of all characters/i });
    await user.click(within(dialog).getByRole('button', { name: /^log out$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/could not log out/i);
    expect(await db.characters.count()).toBe(1);
  });

  it('ignores a hash that only names an inherited object member', async () => {
    window.history.pushState({}, '', '/settings/market#constructor');
    renderSettingsPage();

    expect(await screen.findByRole('combobox', { name: /^trade hub$/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings/market');
  });

  it('does not show the CCP data credit on Cached data', async () => {
    window.history.pushState({}, '', '/settings/dataAge');
    renderSettingsPage();

    expect(
      await screen.findByRole('button', { name: /clear cached eve data/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /data credit/i })).not.toBeInTheDocument();
  });

  it('gives both backup password inputs a visible <label for>', async () => {
    window.history.pushState({}, '', '/settings/app');
    const { container } = renderSettingsPage();

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
    serviceWorker(registration({ waiting: {} }));
    vi.mocked(forceUpdate).mockResolvedValue('failed');
    renderSettingsPage();

    const nav = await screen.findByRole('navigation', { name: /settings sections/i });
    const row = await within(nav).findByRole('link', { name: /^app & backup/i });
    expect(row).toHaveTextContent('Update available');
    expect(screen.queryAllByText('Checking for updates…')).toHaveLength(0);
    await userEvent.click(within(nav).getByRole('button', { name: 'Update now' }));
    expect(forceUpdate).toHaveBeenCalledOnce();
    expect(await within(nav).findByRole('alert')).toHaveTextContent(/could not check/i);
  });

  it('phone index: says the update is still rolling out when no new worker came yet', async () => {
    window.history.pushState({}, '', '/settings');
    serviceWorker(registration({ waiting: {} }));
    vi.mocked(forceUpdate).mockResolvedValue('pending');
    renderSettingsPage();

    const nav = await screen.findByRole('navigation', { name: /settings sections/i });
    await userEvent.click(await within(nav).findByRole('button', { name: 'Update now' }));
    expect(await within(nav).findByText(/still rolling out/i)).toBeInTheDocument();
    expect(within(nav).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('phone index: checking, then no updates', async () => {
    window.history.pushState({}, '', '/settings');
    let finish!: () => void;
    const reg = registration({ update: vi.fn(() => new Promise<void>((r) => (finish = r))) });
    serviceWorker(reg);
    renderSettingsPage();

    expect((await screen.findAllByText('Checking for updates…')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument();
    finish();
    expect((await screen.findAllByText('Up to date')).length).toBeGreaterThan(0);
  });

  it("phone index: says so when the check can't run", async () => {
    window.history.pushState({}, '', '/settings');
    serviceWorker(registration({ update: vi.fn().mockRejectedValue(new Error('offline')) }));
    renderSettingsPage();
    expect((await screen.findAllByText("Offline, couldn't check")).length).toBeGreaterThan(0);
  });

  it('checks once per visit, from any URL, and not when moving between sections', async () => {
    window.history.pushState({}, '', '/settings/industry');
    const reg = registration();
    serviceWorker(reg);
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    await waitFor(() => expect(useUpdateStatus.getState().status).toBe('current'));
    expect(reg.update).toHaveBeenCalledTimes(1);

    await userEvent.click(within(settingsNav()).getByRole('link', { name: /^display/i }));
    await userEvent.click(within(settingsNav()).getByRole('link', { name: /^app & backup/i }));
    await screen.findAllByText('Up to date');
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  it('rail dot and the App & backup line follow the state', async () => {
    window.history.pushState({}, '', '/settings/app');
    serviceWorker(registration({ waiting: {} }));
    renderSettingsPage();

    await screen.findByRole('heading', { level: 1, name: /settings/i });
    const nav = settingsNav();
    expect(await within(nav).findByRole('img', { name: 'Update available' })).toBeInTheDocument();
    const panel = await screen.findByText('Update available', { selector: 'p' });
    // The page's own button. In the app the shell rail's callout carries a
    // second one; without the shell this is the only one.
    expect(await screen.findByRole('button', { name: 'Update now' })).toBeInTheDocument();

    act(() => useUpdateStatus.setState({ status: 'current' }));
    expect(within(nav).queryByRole('img', { name: 'Update available' })).not.toBeInTheDocument();
    expect(panel).toHaveTextContent('Up to date');
  });
});
