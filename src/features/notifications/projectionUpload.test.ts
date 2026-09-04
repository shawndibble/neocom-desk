import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readNotificationPermission } from './permission';
import { webPushSupport, registerDeviceForWebPush } from '@/sync/deviceRegistration';
import { uploadProjectionRows } from './projectionUpload';
import type { ProjectionRow } from '@/engine/projection';

vi.mock('./permission', () => ({
  readNotificationPermission: vi.fn(),
}));
vi.mock('@/sync/deviceRegistration', () => ({
  webPushSupport: vi.fn(),
  registerDeviceForWebPush: vi.fn(),
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
      rows
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
