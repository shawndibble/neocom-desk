import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { deleteToken, getToken } from 'firebase/messaging';
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import {
  REREGISTER_AFTER_MS,
  registerDeviceForWebPush,
  unregisterDeviceForWebPush,
} from './deviceRegistration';
import { getDeviceId } from './deviceId';

vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
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
  vi.restoreAllMocks();
  localStorage.clear();
  vi.mocked(getDeviceId).mockReturnValue('device-1');
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  call.mockResolvedValue({ data: { deviceId: 'device-1', registered: [1], rejected: [] } });
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

  it('does not mint an FCM token for a device holding no Characters', async () => {
    vi.mocked(getToken).mockResolvedValue('fcm-token');
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([]);
    await registerDeviceForWebPush('vapid-key', registration);
    expect(getToken).not.toHaveBeenCalled();
  });

  it('drops a token minted while the roster emptied', async () => {
    vi.mocked(getToken).mockResolvedValue('fcm-token');
    vi.mocked(deleteToken).mockResolvedValue(true);
    vi.spyOn(db.characters, 'toArray')
      .mockResolvedValueOnce([{ characterId: 1, name: 'P', ownerHash: 'h', addedAt: 1 }])
      .mockResolvedValueOnce([]);
    const result = await registerDeviceForWebPush('vapid-key', registration);
    expect(result).toBeNull();
    expect(deleteToken).toHaveBeenCalledTimes(1);
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
        { characterId: 1, accessToken: 'token-1', projectionRows: [] },
        { characterId: 2, accessToken: 'token-2', projectionRows: [] },
      ],
    });
    expect(result).toEqual({ deviceId: 'device-1', registered: [1], rejected: [] });
  });

  it('includes each Character’s Projection rows from the passed-in map, keyed by characterId', async () => {
    vi.mocked(getToken).mockResolvedValue('fcm-token');
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([
      { characterId: 1, name: 'A', ownerHash: 'h', addedAt: 0 },
      { characterId: 2, name: 'B', ownerHash: 'h', addedAt: 0 },
    ] as never);
    vi.mocked(getValidAccessToken).mockImplementation(async (id) => `token-${id}`);
    const row = {
      characterId: 1,
      eventId: 'industryJobComplete' as const,
      occurrenceKey: '1:industryJobComplete:987',
      fireAt: 1_700_000_000_000,
      title: 'Industry job complete',
      body: 'done',
    };

    await registerDeviceForWebPush('vapid-key', registration, new Map([[1, [row]]]));

    expect(call).toHaveBeenCalledWith({
      deviceId: 'device-1',
      fcmToken: 'fcm-token',
      characters: [
        { characterId: 1, accessToken: 'token-1', projectionRows: [row] },
        { characterId: 2, accessToken: 'token-2', projectionRows: [] },
      ],
    });
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

  it('still registers the Characters whose token fetch succeeded when one fails', async () => {
    // A stale/expired access token for one Character (e.g. not opened in a
    // while) must not stop the others from registering — matches the
    // backend's own per-character partial-success design in registerDevice.ts.
    vi.mocked(getToken).mockResolvedValue('fcm-token');
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([
      { characterId: 1, name: 'A', ownerHash: 'h', addedAt: 0 },
      { characterId: 2, name: 'B', ownerHash: 'h', addedAt: 0 },
      { characterId: 3, name: 'C', ownerHash: 'h', addedAt: 0 },
    ] as never);
    vi.mocked(getValidAccessToken).mockImplementation(async (id) => {
      if (id === 2) throw new Error('No token stored for character 2');
      return `token-${id}`;
    });

    const result = await registerDeviceForWebPush('vapid-key', registration);

    expect(call).toHaveBeenCalledWith({
      deviceId: 'device-1',
      fcmToken: 'fcm-token',
      characters: [
        { characterId: 1, accessToken: 'token-1', projectionRows: [] },
        { characterId: 3, accessToken: 'token-3', projectionRows: [] },
      ],
    });
    expect(result).toEqual({ deviceId: 'device-1', registered: [1], rejected: [] });
  });

  it('returns null without calling the callable when every Character’s token fetch fails', async () => {
    vi.mocked(getToken).mockResolvedValue('fcm-token');
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([
      { characterId: 1, name: 'A', ownerHash: 'h', addedAt: 0 },
    ] as never);
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error('No token stored for character 1'));

    const result = await registerDeviceForWebPush('vapid-key', registration);

    expect(result).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('registerDeviceForWebPush with skipIfUnchanged (the 5-minute poll)', () => {
  const registration = {} as ServiceWorkerRegistration;
  const row = {
    characterId: 1,
    eventId: 'industryJobComplete' as const,
    occurrenceKey: '1:industryJobComplete:987',
    fireAt: 1_700_000_000_000,
    title: 'Industry job complete',
    body: 'done',
  };
  const poll = (rows = new Map([[1, [row]]])) =>
    registerDeviceForWebPush('vapid-key', registration, rows, { skipIfUnchanged: true });

  beforeEach(() => {
    vi.mocked(getToken).mockResolvedValue('fcm-token');
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([
      { characterId: 1, name: 'A', ownerHash: 'h', addedAt: 0 },
    ] as never);
    vi.mocked(getValidAccessToken).mockResolvedValue('token-1');
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  it('skips the callable and every access-token refresh when nothing changed', async () => {
    await poll();
    vi.mocked(getValidAccessToken).mockClear();
    call.mockClear();

    await poll();

    expect(getValidAccessToken).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it('ignores row and Map ordering when deciding nothing changed', async () => {
    const other = { ...row, occurrenceKey: '1:industryJobComplete:988' };
    await poll(new Map([[1, [row, other]]]));
    call.mockClear();
    await poll(new Map([[1, [other, row]]]));
    expect(call).not.toHaveBeenCalled();
  });

  it('re-registers once the last upload is older than REREGISTER_AFTER_MS', async () => {
    await poll();
    call.mockClear();
    vi.mocked(Date.now).mockReturnValue(1_700_000_000_000 + REREGISTER_AFTER_MS);
    await poll();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('re-registers when the Projection rows change', async () => {
    await poll();
    call.mockClear();
    await poll(new Map([[1, [{ ...row, fireAt: row.fireAt + 60_000 }]]]));
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('re-registers when the FCM token rotates', async () => {
    await poll();
    call.mockClear();
    vi.mocked(getToken).mockResolvedValue('rotated-token');
    await poll();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('re-registers when the roster changes', async () => {
    await poll();
    call.mockClear();
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([
      { characterId: 1, name: 'A', ownerHash: 'h', addedAt: 0 },
      { characterId: 2, name: 'B', ownerHash: 'h', addedAt: 0 },
    ] as never);
    await poll();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('does not remember a partial registration, so the next poll retries it', async () => {
    call.mockResolvedValueOnce({ data: { deviceId: 'device-1', registered: [], rejected: [1] } });
    await poll();
    call.mockClear();
    await poll();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('does not remember a registration that left a Character without a token', async () => {
    vi.spyOn(db.characters, 'toArray').mockResolvedValue([
      { characterId: 1, name: 'A', ownerHash: 'h', addedAt: 0 },
      { characterId: 2, name: 'B', ownerHash: 'h', addedAt: 0 },
    ] as never);
    vi.mocked(getValidAccessToken).mockImplementation(async (id) => {
      if (id === 2) throw new Error('expired');
      return 'token-1';
    });
    await poll();
    call.mockClear();
    await poll();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('always registers without skipIfUnchanged (the Enable tap)', async () => {
    await poll();
    call.mockClear();
    await registerDeviceForWebPush('vapid-key', registration, new Map([[1, [row]]]));
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('forgets the last registration on unregister', async () => {
    vi.mocked(deleteToken).mockResolvedValue(true);
    await poll();
    await unregisterDeviceForWebPush();
    call.mockClear();
    await poll();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('still registers when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await expect(poll()).resolves.not.toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('unregisterDeviceForWebPush', () => {
  it('deletes this device’s FCM token', async () => {
    vi.mocked(deleteToken).mockResolvedValue(true);
    await unregisterDeviceForWebPush();
    expect(deleteToken).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
  });
});
