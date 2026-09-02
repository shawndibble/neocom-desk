import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import {
  NOTIFICATION_PERMISSION_PROMPT_KEY,
  DEFAULT_NOTIFICATION_PROMPT_STATE,
  useNotificationPromptState,
  readNotificationPermission,
  requestNotificationPermission,
  promptStateAfterAsk,
  shouldShowPermissionExplainer,
  notificationsBlocked,
} from './permission';

function stubNotification(permission: NotificationPermission, request?: () => Promise<unknown>) {
  const requestPermission = vi.fn(request ?? (async () => permission));
  vi.stubGlobal('Notification', { permission, requestPermission });
  return requestPermission;
}

beforeEach(async () => {
  await db.settings.clear();
  useNotificationPromptState.setState({
    value: DEFAULT_NOTIFICATION_PROMPT_STATE,
    hydrated: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readNotificationPermission', () => {
  it('reports "unsupported" when the browser has no Notification API', () => {
    expect(readNotificationPermission()).toBe('unsupported');
  });

  it('reads the live browser permission when the API exists', () => {
    stubNotification('denied');
    expect(readNotificationPermission()).toBe('denied');
  });
});

describe('requestNotificationPermission', () => {
  it('does not throw and reports "unsupported" without the Notification API', async () => {
    await expect(requestNotificationPermission()).resolves.toBe('unsupported');
  });

  it('calls the real browser request and returns its answer', async () => {
    const requestPermission = stubNotification('default', async () => 'granted');
    await expect(requestNotificationPermission()).resolves.toBe('granted');
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('falls back to the current permission when the request rejects', async () => {
    stubNotification('denied', () => Promise.reject(new Error('nope')));
    await expect(requestNotificationPermission()).resolves.toBe('denied');
  });
});

describe('promptStateAfterAsk', () => {
  it('marks the device offered and records what the browser answered', () => {
    expect(promptStateAfterAsk('granted')).toEqual({ seen: true, outcome: 'granted' });
    expect(promptStateAfterAsk('denied')).toEqual({ seen: true, outcome: 'denied' });
  });

  it('counts a dismissed browser prompt as offered, still with no grant', () => {
    expect(promptStateAfterAsk('default')).toEqual({ seen: true, outcome: 'default' });
  });

  it('records no outcome where no browser could answer', () => {
    expect(promptStateAfterAsk('unsupported')).toEqual({ seen: true, outcome: null });
  });
});

describe('shouldShowPermissionExplainer', () => {
  const base = {
    hydrated: true,
    seen: false,
    hasCharacter: true,
    permission: 'default',
  } as const;

  it('shows once a character exists and the device has never been asked', () => {
    expect(shouldShowPermissionExplainer(base)).toBe(true);
  });

  it('stays hidden until the stored "already offered" flag has loaded', () => {
    expect(shouldShowPermissionExplainer({ ...base, hydrated: false })).toBe(false);
  });

  it('never returns after the device has been offered it once', () => {
    expect(shouldShowPermissionExplainer({ ...base, seen: true })).toBe(false);
  });

  it('waits for the first character login', () => {
    expect(shouldShowPermissionExplainer({ ...base, hasCharacter: false })).toBe(false);
  });

  it('stays hidden when the browser has already answered', () => {
    expect(shouldShowPermissionExplainer({ ...base, permission: 'granted' })).toBe(false);
    expect(shouldShowPermissionExplainer({ ...base, permission: 'denied' })).toBe(false);
  });

  it('stays hidden where notifications do not exist at all', () => {
    expect(shouldShowPermissionExplainer({ ...base, permission: 'unsupported' })).toBe(false);
  });
});

describe('notificationsBlocked', () => {
  it('is true only for a denied grant — an unsupported browser is not "blocked"', () => {
    expect(notificationsBlocked('denied')).toBe(true);
    expect(notificationsBlocked('default')).toBe(false);
    expect(notificationsBlocked('granted')).toBe(false);
    expect(notificationsBlocked('unsupported')).toBe(false);
  });
});

describe('useNotificationPromptState', () => {
  it('persists the outcome device-locally under a non-syncing key', async () => {
    expect(NOTIFICATION_PERMISSION_PROMPT_KEY.startsWith('sync.')).toBe(false);
    await useNotificationPromptState.getState().setValue({ seen: true, outcome: 'denied' });
    expect(await db.settings.get(NOTIFICATION_PERMISSION_PROMPT_KEY)).toEqual({
      key: NOTIFICATION_PERMISSION_PROMPT_KEY,
      value: { seen: true, outcome: 'denied' },
    });
  });

  it('falls back to "never offered" when the stored row is malformed', async () => {
    await db.settings.put({ key: NOTIFICATION_PERMISSION_PROMPT_KEY, value: { seen: 'yes' } });
    await useNotificationPromptState.getState().hydrate();
    expect(useNotificationPromptState.getState().value).toEqual(DEFAULT_NOTIFICATION_PROMPT_STATE);
  });

  it('hydrates a stored outcome', async () => {
    await db.settings.put({
      key: NOTIFICATION_PERMISSION_PROMPT_KEY,
      value: { seen: true, outcome: 'granted' },
    });
    await useNotificationPromptState.getState().hydrate();
    expect(useNotificationPromptState.getState().value).toEqual({ seen: true, outcome: 'granted' });
  });
});
