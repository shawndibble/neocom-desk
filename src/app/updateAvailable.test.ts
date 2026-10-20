import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isUpdateAvailable } from './updateAvailable';

const getServiceWorkerRegistration = vi.fn();
vi.mock('@/lib/serviceWorker', () => ({
  getServiceWorkerRegistration: () => getServiceWorkerRegistration(),
}));

beforeEach(() => getServiceWorkerRegistration.mockReset());

describe('isUpdateAvailable', () => {
  it('is false without a service worker registration', async () => {
    getServiceWorkerRegistration.mockResolvedValue(undefined);
    expect(await isUpdateAvailable()).toBe(false);
  });

  it('is true at once when a build is already waiting, without asking the server', async () => {
    const update = vi.fn();
    getServiceWorkerRegistration.mockResolvedValue({ waiting: {}, update });
    expect(await isUpdateAvailable()).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('checks the server and reports a build that then waits', async () => {
    const registration = { waiting: null as unknown, installing: null, update: vi.fn() };
    registration.update.mockImplementation(async () => {
      registration.waiting = {};
    });
    getServiceWorkerRegistration.mockResolvedValue(registration);
    expect(await isUpdateAvailable()).toBe(true);
  });

  it('is false when nothing new is found, and when the check fails', async () => {
    getServiceWorkerRegistration.mockResolvedValue({
      waiting: null,
      installing: null,
      update: vi.fn(),
    });
    expect(await isUpdateAvailable()).toBe(false);
    getServiceWorkerRegistration.mockResolvedValue({
      waiting: null,
      update: vi.fn().mockRejectedValue(new Error('offline')),
    });
    expect(await isUpdateAvailable()).toBe(false);
  });
});
