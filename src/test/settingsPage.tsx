import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, within, type RenderResult } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { ESI_BASE_URL } from '@/esi/client';
import { Settings } from '@/routes/Settings';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { useActivityLog } from '@/stores/activityLog';
import { useFontScale, DEFAULT_FONT_SCALE } from '@/lib/fontScale';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';
import { useTimeFormat, DEFAULT_TIME_FORMAT } from '@/lib/timeFormat';
import { DEFAULT_MOBILE_TABS, useMobileTabs } from '@/lib/mobileTabs';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import {
  useCalendarWeekStart,
  DEFAULT_CALENDAR_WEEK_START,
} from '@/features/character/calendarWeekStart';
import { useMarketHub } from '@/features/market/hub';
import { usePageHubs } from '@/features/market/pageHubs';
import { useAssumedMe } from '@/features/industry/assumedMe';
import { useAssumedTe } from '@/features/industry/assumedTe';
import {
  useFacilityDefaults,
  DEFAULT_FACILITY_DEFAULTS,
} from '@/features/industry/facilityDefaults';
import {
  useReactionFacilityDefaults,
  DEFAULT_REACTION_FACILITY_DEFAULTS,
} from '@/features/industry/reactionFacilityDefaults';
import { useExpiringWindowHours } from '@/features/pi/expiringWindow';
import { useDarkThreshold } from '@/features/corp/darkThreshold';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { usePushFailure } from '@/features/notifications/pushFailure';
import {
  useNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/features/notifications/preferences';
import {
  useNotificationPromptState,
  DEFAULT_NOTIFICATION_PROMPT_STATE,
} from '@/features/notifications/permission';
import { mswServer } from '@/test/msw';
import { renderPageRoute } from '@/test/renderPage';

export const CHAR_ID = 91;

export function renderSettingsPage(): RenderResult {
  return renderPageRoute('/settings', <Settings />);
}

export function stubNotification(permission: NotificationPermission) {
  const requestPermission = vi.fn(async () => permission);
  vi.stubGlobal('Notification', { permission, requestPermission });
  return requestPermission;
}

export function settingsNav(): HTMLElement {
  return screen.getByRole('navigation', { name: /settings sections/i });
}

export async function openTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await screen.findByRole('heading', { level: 1, name: /settings/i });
  await user.click(within(settingsNav()).getByRole('link', { name }));
}

async function resetSettingsSession() {
  await db.characters.clear();
  await db.settings.clear();
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useFontScale.setState({ value: DEFAULT_FONT_SCALE, hydrated: false });
  useSingleKeyShortcuts.setState({ value: true, hydrated: false });
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: false });
  useAvoidedSystems.setState({ value: [], hydrated: false });
  useCalendarWeekStart.setState({ value: DEFAULT_CALENDAR_WEEK_START, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  usePageHubs.setState({ value: {}, hydrated: false });
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
  window.history.pushState({}, '', '/settings/display');
}

export function installSettingsHarness({ app = false }: { app?: boolean } = {}): void {
  mswServer(
    http.get(`${ESI_BASE_URL}/characters/:id/roles`, () => HttpResponse.json({})),
    http.get('*/version.json', () => new HttpResponse(null, { status: 404 }))
  );

  beforeAll(async () => {
    await resetSettingsSession();
    const App = app ? (await import('@/app/App')).App : null;
    if (app) await (await import('@/app/routeChunks')).loadSettings();
    const { unmount } = App ? render(<App />) : renderSettingsPage();
    await screen.findByRole('heading', { level: 1, name: /settings/i }, { timeout: 25_000 });
    unmount();
  }, 30_000);

  beforeEach(resetSettingsSession);

  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
