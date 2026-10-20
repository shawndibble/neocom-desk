import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForUpdate, useUpdateStatus, watchRegistration } from './updateAvailable';

const getServiceWorkerRegistration = vi.fn();
vi.mock('@/lib/serviceWorker', () => ({
  getServiceWorkerRegistration: () => getServiceWorkerRegistration(),
}));

const status = () => useUpdateStatus.getState().status;

function fakeRegistration(over: Record<string, unknown> = {}) {
  const target = new EventTarget();
  return Object.assign(target, { waiting: null, installing: null, update: vi.fn(), ...over });
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  getServiceWorkerRegistration.mockReset();
  useUpdateStatus.setState({ status: 'unknown' });
});

describe('checkForUpdate', () => {
  it('is current without a service worker', async () => {
    getServiceWorkerRegistration.mockResolvedValue(undefined);
    await checkForUpdate();
    expect(status()).toBe('current');
  });

  it('is available at once for a waiting worker, never passing through checking', async () => {
    const registration = fakeRegistration({ waiting: {} });
    getServiceWorkerRegistration.mockResolvedValue(registration);
    const seen: string[] = [];
    const stop = useUpdateStatus.subscribe((s) => seen.push(s.status));
    await checkForUpdate();
    stop();
    expect(seen).not.toContain('checking');
    expect(status()).toBe('available');
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('is checking while the server is asked, then available when a build then waits', async () => {
    const registration = fakeRegistration();
    registration.update.mockImplementation(async () => {
      expect(status()).toBe('checking');
      registration.waiting = {} as never;
    });
    getServiceWorkerRegistration.mockResolvedValue(registration);
    await checkForUpdate();
    expect(status()).toBe('available');
  });

  it('is current when nothing new is found', async () => {
    getServiceWorkerRegistration.mockResolvedValue(fakeRegistration());
    await checkForUpdate();
    expect(status()).toBe('current');
  });

  it('is offline when the check fails', async () => {
    const registration = fakeRegistration();
    registration.update.mockRejectedValue(new Error('offline'));
    getServiceWorkerRegistration.mockResolvedValue(registration);
    await checkForUpdate();
    expect(status()).toBe('offline');
  });

  it('is offline, without asking the server, when the browser is offline', async () => {
    const registration = fakeRegistration();
    getServiceWorkerRegistration.mockResolvedValue(registration);
    vi.stubGlobal('navigator', { onLine: false });
    await checkForUpdate();
    expect(status()).toBe('offline');
    expect(registration.update).not.toHaveBeenCalled();
  });
});

describe('checkForUpdate overlap', () => {
  it('shares one check between concurrent callers', async () => {
    const registration = fakeRegistration();
    getServiceWorkerRegistration.mockResolvedValue(registration);
    await Promise.all([checkForUpdate(), checkForUpdate()]);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('never downgrades available', async () => {
    const registration = fakeRegistration();
    registration.update.mockImplementation(async () => {
      useUpdateStatus.setState({ status: 'available' });
    });
    getServiceWorkerRegistration.mockResolvedValue(registration);
    await checkForUpdate();
    expect(status()).toBe('available');
  });
});

describe('watchRegistration', () => {
  it('watches a worker that is already installing', () => {
    const installing = Object.assign(new EventTarget(), { state: 'installing' });
    const registration = fakeRegistration({ installing });
    watchRegistration(registration as never);
    installing.state = 'installed';
    registration.waiting = {} as never;
    installing.dispatchEvent(new Event('statechange'));
    expect(status()).toBe('available');
  });

  it('turns available when an installing worker reaches installed', () => {
    const registration = fakeRegistration();
    const installing = Object.assign(new EventTarget(), { state: 'installing' });
    watchRegistration(registration as never);
    expect(status()).toBe('unknown');
    registration.installing = installing as never;
    registration.dispatchEvent(new Event('updatefound'));
    installing.state = 'installed';
    registration.waiting = {} as never;
    installing.dispatchEvent(new Event('statechange'));
    expect(status()).toBe('available');
  });

  it('is available for a registration that already has a waiting worker', () => {
    watchRegistration(fakeRegistration({ waiting: {} }) as never);
    expect(status()).toBe('available');
  });
});
