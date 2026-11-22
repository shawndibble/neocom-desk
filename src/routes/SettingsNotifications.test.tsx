import { describe, it, expect, beforeEach, afterEach, onTestFinished, vi } from 'vitest';
import { enableWebPush } from '@/features/notifications/webPush';
import { clearPushFailure, usePushFailure } from '@/features/notifications/pushFailure';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY } from '@/stores/activeCharacter';
import en from '@/i18n/locales/en.json';
import { NOTIFICATION_EVENTS } from '@/features/notifications/events';
import {
  useNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFS_SETTING_KEY,
} from '@/features/notifications/preferences';
import { NOTIFICATION_PERMISSION_PROMPT_KEY } from '@/features/notifications/permission';
import { isEventEnabledFor } from '@/features/notifications/eventSelection';
import { rebuildProjection } from '@/features/notifications/projectionRebuild';
import {
  PROJECTION_REBUILD_DELAY_MS,
  scheduleProjectionRebuild,
} from '@/features/notifications/projectionRebuildScheduler';
import { PLAY_STORE_PACKAGE, androidNotificationSettingsUrl } from '@/lib/playStoreApp';
import { assignLocation } from '@/app/navigation';
import {
  CHAR_ID,
  renderSettingsPage,
  settingsNav,
  stubNotification,
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
    // The Device column is greyed without a grant (issue #5330); these tests act on it.
    stubNotification('granted');
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
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
    await notificationsPanel();
    await openTopic(user, 'Industry and PI');

    await waitFor(() => {
      expect(rowCheckbox('Planetary extractor expiring', 'device')).toBeInTheDocument();
      expect(rowCheckbox('Planetary extractor expiring', 'Alerts')).toBeInTheDocument();
    });
    // On the row's face, whether or not the row is open.
    expect(screen.getAllByText(/arrives up to 72 hours ahead/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a row is indeterminate once characters disagree, and one click brings everyone to on', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
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
    renderSettingsPage();
    await notificationsPanel();

    await user.click(await screen.findByRole('checkbox', { name: /enable notifications/i }));

    expect((await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))?.value).toMatchObject({
      masterEnabled: false,
    });
  });

  it('shows a blocked notice and disables only the browser controls while permission is denied', async () => {
    stubNotification('denied');
    const user = userEvent.setup();
    renderSettingsPage();
    await notificationsPanel();
    await openTopic(user, 'Mail and calendar');

    expect((await screen.findAllByText(/notifications are blocked/i)).length).toBeGreaterThan(0);
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
      renderSettingsPage();
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
      renderSettingsPage();
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
      renderSettingsPage();
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

  it('ticking Device pop-ups makes the browser request, and no request without it', async () => {
    const requestPermission = stubNotification('default');
    const user = userEvent.setup();
    renderSettingsPage();
    await notificationsPanel();

    const deviceBox = await screen.findByRole('checkbox', { name: 'Device pop-ups' });
    expect(requestPermission).not.toHaveBeenCalled();
    // Nothing has been asked yet, so there is nothing switched on to show.
    expect(deviceBox).not.toBeChecked();
    expect(
      screen.queryByRole('button', { name: /turn on device notifications/i })
    ).not.toBeInTheDocument();

    await user.click(deviceBox);
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

  it('leaves Device pop-ups unticked when the browser denies the request', async () => {
    const requestPermission = vi.fn(async () => 'denied' as NotificationPermission);
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const user = userEvent.setup();
    renderSettingsPage();
    await notificationsPanel();

    const deviceBox = await screen.findByRole('checkbox', { name: 'Device pop-ups' });
    await user.click(deviceBox);
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('checkbox', { name: 'Device pop-ups' })).not.toBeChecked();
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
    renderSettingsPage();
    await notificationsPanel();

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Device pop-ups' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(enableWebPush).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText(/couldn't reach the server/i)).not.toBeInTheDocument()
    );
  });

  it('says when the push setup last failed, so a Retry that fails again visibly does something', async () => {
    const user = userEvent.setup();
    stubNotification('granted');
    usePushFailure.setState({ value: { reason: 'server-rejected', at: 1 }, hydrated: true });
    vi.mocked(enableWebPush).mockImplementationOnce(async () => {
      await usePushFailure
        .getState()
        .setValue({ reason: 'server-rejected', at: new Date(2026, 9, 25, 14, 21).getTime() });
      return { support: 'supported', permission: 'granted' };
    });
    renderSettingsPage();
    await notificationsPanel();
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect((await screen.findAllByText(/Last tried at 0?2:21/)).length).toBeGreaterThan(0);
  });

  it('shows no push failure row when nothing failed', async () => {
    stubNotification('granted');
    renderSettingsPage();
    await notificationsPanel();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Device pop-ups' })).toBeEnabled()
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('never requests permission on its own when the grant is already settled', async () => {
    const requestPermission = stubNotification('granted');
    const user = userEvent.setup();
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
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
    expect(at(corp, 'Only alerts while the app is open')).toBeLessThan(
      at(corp, 'Structure fuel low')
    );
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
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
    await notificationsPanel();

    await waitFor(() => expect(rowCheckbox('New mail', 'device')).toBeInTheDocument());
    expect(
      screen.queryByRole('checkbox', {
        name: 'Skill level complete for every character, device notifications',
      })
    ).not.toBeInTheDocument();
  });

  it('finds an EVE notification type from the URL search, listing it with no unrelated rows', async () => {
    window.history.pushState({}, '', '/settings/notifications?search=Structure%20Low%20on%20Fuel');
    renderSettingsPage();
    await notificationsPanel();

    expect(
      await screen.findByRole('button', { name: 'Structure Low on Fuel' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Structure Destroyed' })).not.toBeInTheDocument();
    expect(screen.queryByText('No matching events or characters')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', {
        name: 'Skill level complete for every character, device notifications',
      })
    ).not.toBeInTheDocument();
  });

  it('writes typed search text to the URL once typing pauses, and leaves the default out', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
    await notificationsPanel();

    await user.type(await screen.findByRole('searchbox'), 'mail');

    await waitFor(() => expect(window.location.search).toBe('?search=mail'));
  });

  it("lands on the Notifications tab when the Overview feed's link names it", async () => {
    // The feed links to /settings/notifications directly (ADR 0015: tab is a path segment).
    window.history.pushState({}, '', '/settings/notifications');
    renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i });

    expect(
      await within(settingsNav()).findByRole('link', { name: /^notifications$/i })
    ).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText(en.settings.notifications.hint)).toBeInTheDocument();
  });

  it("names EVE's own notification types in words, not in ESI's CamelCase", async () => {
    const user = userEvent.setup();
    renderSettingsPage();
    const sheet = within(await notificationsPanel());
    await openTopic(user, 'EVE notifications');

    // Listed under the EVE notifications row; nothing to open first.
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
  // About 0.9s: one cold page render plus five topic opens, each a real click on a virtualized list.
  it('marks only the events that really arrive with the app closed', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
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
    renderSettingsPage();
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
    it('greys the Device boxes, ticks kept, until this device grants permission (issue #5330)', async () => {
      stubNotification('default');
      const user = userEvent.setup();
      renderSettingsPage();
      await notificationsPanel();
      await openTopic(user, 'Skills');
      await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());
      expect(rowCheckbox('Skill level complete', 'device')).toBeDisabled();
      expect(rowCheckbox('Skill level complete', 'Alerts')).toBeEnabled();
    });

    it('writes to every Character the event applies to, and skips one whose own scope is missing', async () => {
      const user = userEvent.setup();
      renderSettingsPage();
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
      renderSettingsPage();
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
      renderSettingsPage();
      await notificationsPanel();
      await openTopic(user, 'Skills');

      await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeDisabled());
      // The Alerts column is unaffected — only the device column is permission-gated.
      expect(rowCheckbox('Skill level complete', 'Alerts')).not.toBeDisabled();
    });

    it('never opens a native confirm dialog for a broadcast', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm');
      renderSettingsPage();
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
      renderSettingsPage();
      await notificationsPanel();
      await openTopic(userEvent.setup(), 'Skills');
      await waitFor(() => expect(rowCheckbox('Skill level complete', 'device')).toBeChecked());
      // The scheduler is module state: drop a rebuild an earlier test's browser click queued on
      // real timers (waiting out its 1s delay cost every test here a second), and let one already
      // past its timer land before counting.
      scheduleProjectionRebuild.cancel();
      const rebuild = vi.mocked(rebuildProjection);
      await waitFor(() => expect(rebuild).toHaveResolvedTimes(rebuild.mock.calls.length));
      rebuild.mockClear();
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
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
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
    renderSettingsPage();
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
