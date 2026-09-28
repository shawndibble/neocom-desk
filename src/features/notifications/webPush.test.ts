import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestNotificationPermission } from './permission';
import { registerDeviceForWebPush } from '@/sync/deviceRegistration';
import { webPushSupport } from '@/sync/webPushSupport';
import { enableWebPush } from './webPush';

vi.mock('./permission', () => ({
  requestNotificationPermission: vi.fn(),
}));
vi.mock('@/sync/deviceRegistration', () => ({
  registerDeviceForWebPush: vi.fn(),
}));
vi.mock('@/sync/webPushSupport', () => ({
  webPushSupport: vi.fn(),
}));

const readyRegistration = {} as ServiceWorkerRegistration;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(webPushSupport).mockReturnValue('supported');
  vi.mocked(requestNotificationPermission).mockResolvedValue('granted');
  vi.mocked(registerDeviceForWebPush).mockResolvedValue({
    deviceId: 'd',
    registered: [1],
    rejected: [],
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(readyRegistration) },
    configurable: true,
  });
});

describe('enableWebPush', () => {
  it('skips the permission request entirely when the platform requires install', async () => {
    vi.mocked(webPushSupport).mockReturnValue('requires-install');
    const result = await enableWebPush();
    expect(result).toEqual({ support: 'requires-install', permission: 'default' });
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(registerDeviceForWebPush).not.toHaveBeenCalled();
  });

  it('requests permission and registers the device when supported and granted', async () => {
    const result = await enableWebPush();
    expect(result).toEqual({ support: 'supported', permission: 'granted' });
    expect(requestNotificationPermission).toHaveBeenCalled();
    expect(registerDeviceForWebPush).toHaveBeenCalledWith(expect.any(String), readyRegistration);
  });

  it('asks for permission before awaiting anything, so Safari still sees the tap', () => {
    // Not awaited: the request must already be in flight when the call
    // returns, i.e. no dynamic import or other await sits ahead of it.
    const pending = enableWebPush();
    expect(requestNotificationPermission).toHaveBeenCalled();
    return pending;
  });

  it('does not register the device when permission is denied', async () => {
    vi.mocked(requestNotificationPermission).mockResolvedValue('denied');
    const result = await enableWebPush();
    expect(result).toEqual({ support: 'supported', permission: 'denied' });
    expect(registerDeviceForWebPush).not.toHaveBeenCalled();
  });

  it('still reports the granted permission even if device registration itself fails', async () => {
    vi.mocked(registerDeviceForWebPush).mockRejectedValue(new Error('network error'));
    const result = await enableWebPush();
    expect(result).toEqual({ support: 'supported', permission: 'granted' });
  });

  it('requests permission but does not register when support is unsupported', async () => {
    vi.mocked(webPushSupport).mockReturnValue('unsupported');
    const result = await enableWebPush();
    expect(result).toEqual({ support: 'unsupported', permission: 'granted' });
    expect(requestNotificationPermission).toHaveBeenCalled();
    expect(registerDeviceForWebPush).not.toHaveBeenCalled();
  });
});
