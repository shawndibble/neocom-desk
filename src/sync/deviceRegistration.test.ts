import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getToken } from 'firebase/messaging';
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import { webPushSupport, registerDeviceForWebPush } from './deviceRegistration';
import { getDeviceId } from './deviceId';

vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  getToken: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));
vi.mock('@/auth/session', () => ({
  getValidAccessToken: vi.fn(),
}));
vi.mock('./firebaseApp', () => ({
  getFirebaseApp: () => ({}),
  getSyncFunctions: () => ({}),
}));
vi.mock('./deviceId', () => ({
  getDeviceId: vi.fn(() => 'device-1'),
}));

const call = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDeviceId).mockReturnValue('device-1');
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  call.mockResolvedValue({ data: { deviceId: 'device-1', registered: [1], rejected: [] } });
});

describe('webPushSupport', () => {
  const originalNotification = globalThis.Notification;
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const originalUserAgent = navigator.userAgent;
  const originalMatchMedia = window.matchMedia;

  function setUserAgent(value: string) {
    Object.defineProperty(navigator, 'userAgent', { value, configurable: true });
  }
  function setStandalone(matches: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
  }

  beforeEach(() => {
    // @ts-expect-error -- test-only stub
    globalThis.Notification = function Notification() {};
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    setStandalone(false);
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    }
    setUserAgent(originalUserAgent);
    window.matchMedia = originalMatchMedia;
  });

  it('is unsupported with no Notification API', () => {
    // @ts-expect-error -- test-only
    globalThis.Notification = undefined;
    expect(webPushSupport()).toBe('unsupported');
  });

  it('is unsupported with no serviceWorker in navigator', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
    expect(webPushSupport()).toBe('unsupported');
  });

  it('requires install on iOS Safari when not running standalone', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    setStandalone(false);
    expect(webPushSupport()).toBe('requires-install');
  });

  it('is supported on iOS Safari once running standalone (installed PWA)', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    setStandalone(true);
    expect(webPushSupport()).toBe('supported');
  });

  it('is supported on a non-iOS browser regardless of standalone state', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120');
    setStandalone(false);
    expect(webPushSupport()).toBe('supported');
  });
});

describe('registerDeviceForWebPush', () => {
  const registration = {} as ServiceWorkerRegistration;

  it('returns null when no FCM token can be acquired', async () => {
    vi.mocked(getToken).mockResolvedValue('');
    const result = await registerDeviceForWebPush('vapid-key', registration);
    expect(result).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it('returns null when the device holds no Characters', async () => {
    vi.mocked(getToken).mockResolvedValue('fcm-token');
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([]);
    const result = await registerDeviceForWebPush('vapid-key', registration);
    expect(result).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it('batches every stored Character’s access token into one callable call', async () => {
    vi.mocked(getToken).mockResolvedValue('fcm-token');
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([
      { characterId: 1, name: 'A', ownerHash: 'h', addedAt: 0 },
      { characterId: 2, name: 'B', ownerHash: 'h', addedAt: 0 },
    ] as never);
    vi.mocked(getValidAccessToken).mockImplementation(async (id) => `token-${id}`);

    const result = await registerDeviceForWebPush('vapid-key', registration);

    expect(call).toHaveBeenCalledWith({
      deviceId: 'device-1',
      fcmToken: 'fcm-token',
      characters: [
        { characterId: 1, accessToken: 'token-1' },
        { characterId: 2, accessToken: 'token-2' },
      ],
    });
    expect(result).toEqual({ deviceId: 'device-1', registered: [1], rejected: [] });
  });

  it('requests the FCM token against the passed-in service worker registration', async () => {
    vi.mocked(getToken).mockResolvedValue('fcm-token');
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([
      { characterId: 1, name: 'A', ownerHash: 'h', addedAt: 0 },
    ] as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('token-1');

    await registerDeviceForWebPush('vapid-key', registration);

    expect(getToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vapidKey: 'vapid-key', serviceWorkerRegistration: registration })
    );
  });
});
