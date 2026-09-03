import { describe, it, expect, vi } from 'vitest';
import { displayPageNotification, livePageDisplayEnv, type PageDisplayEnv } from './display';

function env(overrides: Partial<PageDisplayEnv> = {}): PageDisplayEnv {
  return {
    getRegistration: vi.fn(async () => undefined),
    construct: vi.fn(),
    ...overrides,
  };
}

function registration(
  overrides: Partial<ServiceWorkerRegistration> = {}
): ServiceWorkerRegistration {
  return {
    showNotification: vi.fn(async () => {}),
    ...overrides,
  } as unknown as ServiceWorkerRegistration;
}

describe('displayPageNotification', () => {
  it('prefers the Service Worker registration, which is the only path mobile supports', async () => {
    const reg = registration();
    const e = env({ getRegistration: vi.fn(async () => reg) });

    await displayPageNotification(e, 'New mail', 'Test Pilot has new mail.');

    expect(reg.showNotification).toHaveBeenCalledWith('New mail', {
      body: 'Test Pilot has new mail.',
    });
    expect(e.construct).not.toHaveBeenCalled();
  });

  it('falls back to the Notification constructor when no worker is registered', async () => {
    const e = env();

    await displayPageNotification(e, 'New mail', 'Test Pilot has new mail.');

    expect(e.construct).toHaveBeenCalledWith('New mail', { body: 'Test Pilot has new mail.' });
  });

  it('falls back when the registration has no showNotification', async () => {
    const e = env({
      getRegistration: vi.fn(async () => ({}) as unknown as ServiceWorkerRegistration),
    });

    await displayPageNotification(e, 'Title', 'Body');

    expect(e.construct).toHaveBeenCalledWith('Title', { body: 'Body' });
  });

  it('falls back when showNotification rejects', async () => {
    const reg = registration({
      showNotification: vi.fn(async () => {
        throw new Error('nope');
      }),
    });
    const e = env({ getRegistration: vi.fn(async () => reg) });

    await displayPageNotification(e, 'Title', 'Body');

    expect(e.construct).toHaveBeenCalledWith('Title', { body: 'Body' });
  });

  it('falls back when getRegistration itself rejects', async () => {
    const e = env({
      getRegistration: vi.fn(async () => {
        throw new Error('insecure context');
      }),
    });

    await displayPageNotification(e, 'Title', 'Body');

    expect(e.construct).toHaveBeenCalledWith('Title', { body: 'Body' });
  });

  it('resolves rather than throwing when the constructor throws (mobile browsers do)', async () => {
    const e = env({
      construct: vi.fn(() => {
        throw new TypeError('Illegal constructor');
      }),
    });

    await expect(displayPageNotification(e, 'Title', 'Body')).resolves.toBeUndefined();
  });

  it('resolves when there is no display path at all', async () => {
    const e = env({ construct: undefined });
    await expect(displayPageNotification(e, 'Title', 'Body')).resolves.toBeUndefined();
  });
});

describe('livePageDisplayEnv', () => {
  it('reports no constructor when the Notification API is absent (jsdom)', () => {
    expect(livePageDisplayEnv().construct).toBeUndefined();
  });
});
