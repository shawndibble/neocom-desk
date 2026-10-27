// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOT_UPDATE_CHECK_CAP_MS,
  bootUpdateMayHold,
  runBootUpdate,
  type BootUpdateEnv,
} from './bootUpdate';

const realServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
let listeners: Record<string, () => void>;

beforeEach(() => {
  listeners = {};
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn;
      },
      removeEventListener: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  if (realServiceWorker) Object.defineProperty(navigator, 'serviceWorker', realServiceWorker);
  else Reflect.deleteProperty(navigator, 'serviceWorker');
});

const never = () => new Promise<void>(() => {});

function makeEnv(
  registration: unknown,
  overrides: Partial<BootUpdateEnv> = {}
): BootUpdateEnv & { reload: ReturnType<typeof vi.fn> } {
  let last = 0;
  return {
    online: true,
    pathname: '/',
    getRegistration: vi.fn().mockResolvedValue(registration),
    hasController: true,
    wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    reload: vi.fn(),
    now: () => 1_000_000,
    readLast: () => last,
    writeLast: (at: number) => {
      last = at;
    },
    ...overrides,
  } as BootUpdateEnv & { reload: ReturnType<typeof vi.fn> };
}

function reg(extra: Record<string, unknown> = {}) {
  return {
    update: vi.fn().mockResolvedValue(undefined),
    installing: null,
    waiting: null,
    ...extra,
  };
}

describe('runBootUpdate', () => {
  it('skips without any check while offline', async () => {
    const registration = reg();
    const env = makeEnv(registration, { online: false });
    await expect(runBootUpdate(env)).resolves.toBe('skipped');
    expect(env.getRegistration).not.toHaveBeenCalled();
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('on /callback checks for an update but never waits or swaps', async () => {
    const postMessage = vi.fn();
    const registration = reg({ waiting: { postMessage }, update: vi.fn(() => never()) });
    const env = makeEnv(registration, { pathname: '/callback' });
    await expect(runBootUpdate(env)).resolves.toBe('skipped');
    expect(registration.update).toHaveBeenCalledOnce();
    expect(postMessage).not.toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('on /callback does not wait for the registration lookup', async () => {
    const env = makeEnv(reg({}), { pathname: '/callback' });
    env.getRegistration = vi.fn(() => never()) as unknown as typeof env.getRegistration;
    await expect(runBootUpdate(env)).resolves.toBe('skipped');
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('is current at once with no registration', async () => {
    const env = makeEnv(undefined);
    await expect(runBootUpdate(env)).resolves.toBe('current');
  });

  describe('a page no worker controls (hard reload, or a first install)', () => {
    it('activates a waiting build without reloading', async () => {
      const postMessage = vi.fn();
      const registration = reg({ waiting: { postMessage } });
      const env = makeEnv(registration, { hasController: false });
      const done = runBootUpdate(env);
      await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
      listeners.controllerchange();
      await expect(done).resolves.toBe('current');
      expect(env.reload).not.toHaveBeenCalled();
    });

    it('checks first even when a build is already waiting, then activates the newest', async () => {
      const oldPost = vi.fn();
      const newPost = vi.fn();
      const registration: Record<string, unknown> = reg({ waiting: { postMessage: oldPost } });
      (registration.update as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        registration.waiting = { postMessage: newPost };
      });
      const env = makeEnv(registration, { hasController: false });
      const done = runBootUpdate(env);
      await vi.waitFor(() => expect(newPost).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
      expect(oldPost).not.toHaveBeenCalled();
      listeners.controllerchange();
      await expect(done).resolves.toBe('current');
    });

    it('gives up at the cap when the check never settles, without reloading', async () => {
      const registration = reg({ update: vi.fn(() => never()) });
      const env = makeEnv(registration, { hasController: false });
      vi.useFakeTimers();
      const done = runBootUpdate(env);
      await vi.advanceTimersByTimeAsync(BOOT_UPDATE_CHECK_CAP_MS);
      await expect(done).resolves.toBe('current');
      expect(env.reload).not.toHaveBeenCalled();
    });

    it('activates a build found by the check, still without reloading', async () => {
      const postMessage = vi.fn();
      const registration: Record<string, unknown> = reg();
      (registration.update as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        registration.waiting = { postMessage };
      });
      const env = makeEnv(registration, { hasController: false });
      const done = runBootUpdate(env);
      await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
      listeners.controllerchange();
      await expect(done).resolves.toBe('current');
      expect(env.reload).not.toHaveBeenCalled();
    });

    it('does nothing when there is nothing waiting (a first install)', async () => {
      const env = makeEnv(reg(), { hasController: false });
      await expect(runBootUpdate(env)).resolves.toBe('current');
      expect(env.reload).not.toHaveBeenCalled();
    });
  });

  it('swaps a build that is already waiting, then reloads once it takes control', async () => {
    const postMessage = vi.fn();
    const registration = reg({ waiting: { postMessage } });
    const env = makeEnv(registration);
    const done = runBootUpdate(env);
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
    expect(env.reload).not.toHaveBeenCalled();
    listeners.controllerchange();
    await expect(done).resolves.toBe('applying');
    expect(env.reload).toHaveBeenCalledOnce();
    expect(registration.update).not.toHaveBeenCalled();
  });

  describe('a controlled page with nothing waiting', () => {
    it('is current at once, asking for a newer build without waiting on it', async () => {
      const registration = reg({ update: vi.fn(() => never()) });
      const env = makeEnv(registration);
      await expect(runBootUpdate(env)).resolves.toBe('current');
      expect(registration.update).toHaveBeenCalledOnce();
      expect(env.reload).not.toHaveBeenCalled();
    });

    it('leaves a build the check finds waiting for the next load', async () => {
      const postMessage = vi.fn();
      const registration: Record<string, unknown> = reg();
      (registration.update as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        registration.waiting = { postMessage };
      });
      const env = makeEnv(registration);
      await expect(runBootUpdate(env)).resolves.toBe('current');
      await Promise.resolve();
      expect(postMessage).not.toHaveBeenCalled();
      expect(env.reload).not.toHaveBeenCalled();
    });

    it('is current when update() rejects, without an unhandled rejection', async () => {
      const registration = reg({ update: vi.fn().mockRejectedValue(new Error('offline')) });
      const env = makeEnv(registration);
      await expect(runBootUpdate(env)).resolves.toBe('current');
      await Promise.resolve();
      expect(env.reload).not.toHaveBeenCalled();
    });

    it('is current when update() throws synchronously', async () => {
      const registration = reg({
        update: vi.fn(() => {
          throw new Error('invalid state');
        }),
      });
      await expect(runBootUpdate(makeEnv(registration))).resolves.toBe('current');
    });
  });

  it('is current when the registration lookup throws', async () => {
    const env = makeEnv(undefined, { getRegistration: vi.fn().mockRejectedValue(new Error('x')) });
    await expect(runBootUpdate(env)).resolves.toBe('current');
  });

  it('still reloads after a bounded wait when controllerchange never arrives', async () => {
    vi.useFakeTimers();
    const registration = reg({ waiting: { postMessage: vi.fn() } });
    const env = makeEnv(registration);
    const done = runBootUpdate(env);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(done).resolves.toBe('applying');
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('does not swap again right after a swap that did not take (reload-loop guard)', async () => {
    const postMessage = vi.fn();
    const registration = reg({ waiting: { postMessage } });
    const env = makeEnv(registration, { readLast: () => 1_000_000 - 5_000 });
    await expect(runBootUpdate(env)).resolves.toBe('current');
    expect(postMessage).not.toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('swaps again once the guard window has passed, and records the attempt', async () => {
    vi.useFakeTimers();
    const writeLast = vi.fn();
    const env = makeEnv(reg({ waiting: { postMessage: vi.fn() } }), {
      readLast: () => 1_000_000 - 60_000,
      writeLast,
    });
    const done = runBootUpdate(env);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(done).resolves.toBe('applying');
    expect(writeLast).toHaveBeenCalledWith(1_000_000);
  });

  it('does not swap when storage is unavailable', async () => {
    const postMessage = vi.fn();
    const env = makeEnv(reg({ waiting: { postMessage } }), {
      readLast: () => {
        throw new Error('denied');
      },
    });
    await expect(runBootUpdate(env)).resolves.toBe('current');
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('public link routes', () => {
  it.each(['/s/5gqdkt', '/share/fitting', '/communities/join/ABC'])(
    'on %s never checks, waits or swaps, even with a build waiting',
    async (pathname) => {
      const postMessage = vi.fn();
      const registration = reg({ waiting: { postMessage } });
      const env = makeEnv(registration, { pathname });
      await expect(runBootUpdate(env)).resolves.toBe('skipped');
      expect(env.getRegistration).not.toHaveBeenCalled();
      expect(registration.update).not.toHaveBeenCalled();
      expect(postMessage).not.toHaveBeenCalled();
      expect(env.reload).not.toHaveBeenCalled();
    }
  );

  it('does not hold the first frame', () => {
    expect(bootUpdateMayHold(makeEnv(undefined, { pathname: '/s/5gqdkt' }))).toBe(false);
  });
});

describe('bootUpdateMayHold', () => {
  it('holds only when online, controlled by a worker, and not on /callback', () => {
    expect(bootUpdateMayHold(makeEnv(undefined))).toBe(true);
    expect(bootUpdateMayHold(makeEnv(undefined, { online: false }))).toBe(false);
    expect(bootUpdateMayHold(makeEnv(undefined, { hasController: false }))).toBe(false);
    expect(bootUpdateMayHold(makeEnv(undefined, { pathname: '/callback' }))).toBe(false);
  });
});
