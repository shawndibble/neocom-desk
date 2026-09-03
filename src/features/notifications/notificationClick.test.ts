import { describe, it, expect, vi } from 'vitest';
import {
  handleNotificationClick,
  urlFromNotificationData,
  type NotificationClickEnv,
  type WindowClientLike,
} from './notificationClick';

const ORIGIN = 'https://neocomdesk.com';

function client(url: string, overrides: Partial<WindowClientLike> = {}): WindowClientLike {
  return {
    url,
    focus: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    ...overrides,
  };
}

function env(clients: readonly WindowClientLike[], overrides: Partial<NotificationClickEnv> = {}) {
  return {
    matchAll: vi.fn(async () => clients),
    openWindow: vi.fn(async () => {}),
    origin: ORIGIN,
    ...overrides,
  };
}

describe('handleNotificationClick', () => {
  it('opens a window when nothing of ours is open', async () => {
    const e = env([]);
    await handleNotificationClick(e, '/wallet');
    expect(e.openWindow).toHaveBeenCalledWith('/wallet');
  });

  it('focuses an existing window instead of opening a second one', async () => {
    const open = client(`${ORIGIN}/overview`);
    const e = env([open]);

    await handleNotificationClick(e, '/wallet');

    expect(open.focus).toHaveBeenCalled();
    expect(e.openWindow).not.toHaveBeenCalled();
  });

  it('navigates the focused window to the event route', async () => {
    const open = client(`${ORIGIN}/overview`);
    await handleNotificationClick(env([open]), '/wallet');
    expect(open.navigate).toHaveBeenCalledWith('/wallet');
  });

  it('focuses without navigating when already on that route', async () => {
    const open = client(`${ORIGIN}/wallet`);
    await handleNotificationClick(env([open]), '/wallet');
    expect(open.focus).toHaveBeenCalled();
    expect(open.navigate).not.toHaveBeenCalled();
  });

  it('still focuses on a browser with no navigate()', async () => {
    const open = client(`${ORIGIN}/overview`, { navigate: undefined });
    const e = env([open]);
    await handleNotificationClick(e, '/wallet');
    expect(open.focus).toHaveBeenCalled();
    expect(e.openWindow).not.toHaveBeenCalled();
  });

  it('ignores a window on another origin and opens its own', async () => {
    const foreign = client('https://example.com/whatever');
    const e = env([foreign]);

    await handleNotificationClick(e, '/wallet');

    expect(foreign.focus).not.toHaveBeenCalled();
    expect(e.openWindow).toHaveBeenCalledWith('/wallet');
  });

  it('resolves rather than rejecting when the client list throws', async () => {
    const e = env([], {
      matchAll: vi.fn(async () => {
        throw new Error('gone');
      }),
    });
    await expect(handleNotificationClick(e, '/wallet')).resolves.toBeUndefined();
  });

  it('resolves rather than rejecting when focus throws', async () => {
    const open = client(`${ORIGIN}/overview`, {
      focus: vi.fn(async () => {
        throw new Error('denied');
      }),
    });
    await expect(handleNotificationClick(env([open]), '/wallet')).resolves.toBeUndefined();
  });
});

describe('urlFromNotificationData', () => {
  it('reads the url a notification was fired with', () => {
    expect(urlFromNotificationData({ url: '/wallet' })).toBe('/wallet');
  });

  it('falls back for a notification fired before data carried a url', () => {
    expect(urlFromNotificationData(undefined)).toBe('/overview');
    expect(urlFromNotificationData(null)).toBe('/overview');
    expect(urlFromNotificationData({})).toBe('/overview');
  });

  it('falls back for a url that is not a usable string', () => {
    expect(urlFromNotificationData({ url: 42 })).toBe('/overview');
    expect(urlFromNotificationData({ url: '' })).toBe('/overview');
  });
});
