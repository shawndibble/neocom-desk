import { describe, it, expect, vi } from 'vitest';
import {
  registerPeriodicSync,
  PERIODIC_SYNC_TAG,
  PERIODIC_SYNC_MIN_INTERVAL_MS,
  type BackgroundSyncEnv,
} from './backgroundSync';

function env(overrides: Partial<BackgroundSyncEnv> = {}): BackgroundSyncEnv {
  return {
    serviceWorker: undefined,
    permissions: undefined,
    ...overrides,
  };
}

function serviceWorkerContainer(
  registration: Partial<ServiceWorkerRegistration>
): ServiceWorkerContainer {
  return { ready: Promise.resolve(registration) } as unknown as ServiceWorkerContainer;
}

function permissions(state: PermissionState): Permissions {
  return {
    query: vi.fn(async () => ({ state }) as PermissionStatus),
  } as unknown as Permissions;
}

describe('registerPeriodicSync', () => {
  it('does nothing when the platform has no serviceWorker container', async () => {
    await expect(registerPeriodicSync(env())).resolves.toBeUndefined();
  });

  it('does nothing when the ready registration has no periodicSync manager', async () => {
    const sw = serviceWorkerContainer({});
    await expect(
      registerPeriodicSync(env({ serviceWorker: sw, permissions: permissions('granted') }))
    ).resolves.toBeUndefined();
  });

  it('does not register when periodic-background-sync permission is not granted', async () => {
    const register = vi.fn(async () => {});
    const sw = serviceWorkerContainer({
      periodicSync: { register } as unknown as PeriodicSyncManager,
    });
    await registerPeriodicSync(env({ serviceWorker: sw, permissions: permissions('denied') }));
    expect(register).not.toHaveBeenCalled();
  });

  it('registers with the notification-poll tag once granted, skipping the permissions check when unavailable', async () => {
    const register = vi.fn(async () => {});
    const sw = serviceWorkerContainer({
      periodicSync: { register } as unknown as PeriodicSyncManager,
    });
    await registerPeriodicSync(env({ serviceWorker: sw }));
    expect(register).toHaveBeenCalledWith(PERIODIC_SYNC_TAG, {
      minInterval: PERIODIC_SYNC_MIN_INTERVAL_MS,
    });
  });

  it('swallows a rejection from register() rather than throwing', async () => {
    const register = vi.fn(async () => {
      throw new Error('not allowed');
    });
    const sw = serviceWorkerContainer({
      periodicSync: { register } as unknown as PeriodicSyncManager,
    });
    await expect(
      registerPeriodicSync(env({ serviceWorker: sw, permissions: permissions('granted') }))
    ).resolves.toBeUndefined();
  });
});
