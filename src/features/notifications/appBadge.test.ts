import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@/db';
import { refreshAppBadge } from './appBadge';
import { recordFeedEntry } from './feed';
import {
  useNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFS_SETTING_KEY,
} from './preferences';

const setAppBadge = vi.fn(async () => {});
const clearAppBadge = vi.fn(async () => {});

beforeEach(async () => {
  setAppBadge.mockClear();
  clearAppBadge.mockClear();
  vi.stubGlobal('navigator', { setAppBadge, clearAppBadge });
  await db.notificationFeed.clear();
  await db.settings.clear();
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function seed(characterId: number, eventId: string) {
  await recordFeedEntry({ characterId, eventId, title: 't', body: 'b', firedAt: Date.now() });
}

/** Seeding writes entries, and every write refreshes the badge — so forget those calls. */
async function storePrefs(value: unknown) {
  await db.settings.put({ key: NOTIFICATION_PREFS_SETTING_KEY, value });
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: false });
  setAppBadge.mockClear();
  clearAppBadge.mockClear();
}

describe('refreshAppBadge', () => {
  it('counts every character, not just the active one', async () => {
    await seed(1, 'newMail');
    await seed(2, 'newMail');

    setAppBadge.mockClear();
    await refreshAppBadge();

    expect(setAppBadge).toHaveBeenCalledWith(2);
  });

  it('clears when the feed is empty', async () => {
    await refreshAppBadge();
    expect(clearAppBadge).toHaveBeenCalled();
  });

  it('clears when the feed channel is switched off, however many entries exist', async () => {
    await seed(1, 'newMail');
    await storePrefs({ masterEnabled: true, feedEnabled: false, perCharacter: {} });

    await refreshAppBadge();

    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('clears when the master switch is off', async () => {
    await seed(1, 'newMail');
    await storePrefs({ masterEnabled: false, perCharacter: {} });

    await refreshAppBadge();

    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('excludes an event switched off in the list column', async () => {
    await seed(1, 'newMail');
    await seed(1, 'walletBalanceChanged');
    await storePrefs({
      masterEnabled: true,
      perCharacter: { 1: { newMail: { feed: false } } },
    });

    await refreshAppBadge();

    expect(setAppBadge).toHaveBeenCalledWith(1);
  });

  it('still counts an event switched off only in the browser column', async () => {
    await seed(1, 'newMail');
    await storePrefs({
      masterEnabled: true,
      perCharacter: { 1: { newMail: { browser: false } } },
    });

    await refreshAppBadge();

    expect(setAppBadge).toHaveBeenCalledWith(1);
  });
});
