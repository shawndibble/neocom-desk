import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readNotificationPermission } from './permission';
import { registerDeviceForWebPush, unregisterDeviceForWebPush } from '@/sync/deviceRegistration';
import { webPushSupport } from '@/sync/webPushSupport';
import { usePushFailure } from './pushFailure';
import { uploadProjectionRows, unregisterProjectionRegistration } from './projectionUpload';
import type { ProjectionRow } from '@/engine/projection';

vi.mock('./permission', () => ({
  readNotificationPermission: vi.fn(),
}));
vi.mock('@/sync/webPushSupport', () => ({
  webPushSupport: vi.fn(),
}));
vi.mock('@/sync/deviceRegistration', () => ({
  registerDeviceForWebPush: vi.fn(),
  unregisterDeviceForWebPush: vi.fn(),
}));

const readyRegistration = {} as ServiceWorkerRegistration;

const ROW: ProjectionRow = {
  characterId: 1,
  eventId: 'industryJobComplete',
  occurrenceKey: '1:industryJobComplete:987',
  fireAt: 1_700_000_000_000,
  title: 'Industry job complete',
  body: 'done',
};

beforeEach(() => {
  vi.clearAllMocks();
  usePushFailure.setState({ value: null, hydrated: true });
  vi.mocked(webPushSupport).mockReturnValue('supported');
  vi.mocked(readNotificationPermission).mockReturnValue('granted');
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

describe('uploadProjectionRows', () => {
  it('registers the device with the given rows when push is supported and granted', async () => {
    const rows = new Map([[1, [ROW]]]);
    await uploadProjectionRows(rows);
    expect(registerDeviceForWebPush).toHaveBeenCalledWith(
      expect.any(String),
      readyRegistration,
      rows,
      { skipIfUnchanged: true }
    );
  });

  it('does nothing when push is not supported', async () => {
    vi.mocked(webPushSupport).mockReturnValue('unsupported');
    await uploadProjectionRows(new Map([[1, [ROW]]]));
    expect(registerDeviceForWebPush).not.toHaveBeenCalled();
  });

  it('does nothing when the platform requires install', async () => {
    vi.mocked(webPushSupport).mockReturnValue('requires-install');
    await uploadProjectionRows(new Map([[1, [ROW]]]));
    expect(registerDeviceForWebPush).not.toHaveBeenCalled();
  });

  it('does nothing when permission is not granted', async () => {
    vi.mocked(readNotificationPermission).mockReturnValue('default');
    await uploadProjectionRows(new Map([[1, [ROW]]]));
    expect(registerDeviceForWebPush).not.toHaveBeenCalled();
  });

  it('resolves rather than rejecting when registration fails', async () => {
    vi.mocked(registerDeviceForWebPush).mockRejectedValue(new Error('network error'));
    await expect(uploadProjectionRows(new Map([[1, [ROW]]]))).resolves.toBeUndefined();
  });
});

describe('push failure record', () => {
  it('records a failed upload and clears it on the next success', async () => {
    vi.mocked(registerDeviceForWebPush).mockRejectedValueOnce(new Error('network error'));
    await uploadProjectionRows(new Map([[1, [ROW]]]));
    expect(usePushFailure.getState().value).not.toBeNull();
    await uploadProjectionRows(new Map([[1, [ROW]]]));
    expect(usePushFailure.getState().value).toBeNull();
  });

  it('leaves a standing failure alone when the upload was skipped as unchanged', async () => {
    usePushFailure.setState({ value: { reason: 'network', at: 1 } });
    vi.mocked(registerDeviceForWebPush).mockResolvedValue(null);
    await uploadProjectionRows(new Map([[1, [ROW]]]));
    expect(usePushFailure.getState().value).toEqual({ reason: 'network', at: 1 });
  });
});

describe('unregisterProjectionRegistration', () => {
  it('unregisters this device when push is supported and granted', async () => {
    await unregisterProjectionRegistration();
    expect(unregisterDeviceForWebPush).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the browser cannot receive push', async () => {
    vi.mocked(webPushSupport).mockReturnValue('unsupported');
    await unregisterProjectionRegistration();
    expect(unregisterDeviceForWebPush).not.toHaveBeenCalled();
  });

  it('does nothing when permission was not granted', async () => {
    vi.mocked(readNotificationPermission).mockReturnValue('default');
    await unregisterProjectionRegistration();
    expect(unregisterDeviceForWebPush).not.toHaveBeenCalled();
  });

  it('logs and resolves when the unregistration fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(unregisterDeviceForWebPush).mockRejectedValue(new Error('offline'));
    await expect(unregisterProjectionRegistration()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
