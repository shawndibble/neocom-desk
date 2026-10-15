import { describe, it, expect, vi } from 'vitest';
import {
  canRecoverFromStaleBuild,
  purgeStaleBuildCaches,
  recoverFromStaleBuild,
  type StaleBuildEnv,
} from './staleBuildRecovery';

function makeEnv(overrides: Partial<StaleBuildEnv> = {}) {
  return {
    now: () => 1_000_000,
    online: () => true,
    readLast: vi.fn().mockReturnValue(0),
    writeLast: vi.fn(),
    purge: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
    ...overrides,
  } satisfies StaleBuildEnv;
}

describe('recoverFromStaleBuild', () => {
  it('purges the worker and caches, then reloads', async () => {
    const env = makeEnv();
    expect(await recoverFromStaleBuild(env)).toBe(true);
    expect(env.writeLast).toHaveBeenCalledWith(1_000_000);
    expect(env.purge).toHaveBeenCalledOnce();
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('declines a second purge inside the window, so it cannot loop', async () => {
    const env = makeEnv({ readLast: vi.fn().mockReturnValue(1_000_000 - 30_000) });
    expect(await recoverFromStaleBuild(env)).toBe(false);
    expect(env.purge).not.toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('purges again once the window has passed', async () => {
    const env = makeEnv({ readLast: vi.fn().mockReturnValue(1_000_000 - 61_000) });
    expect(await recoverFromStaleBuild(env)).toBe(true);
  });

  it('declines when storage is unavailable', async () => {
    const env = makeEnv({
      readLast: vi.fn(() => {
        throw new Error('denied');
      }),
    });
    expect(await recoverFromStaleBuild(env)).toBe(false);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('reloads even when the purge throws', async () => {
    const env = makeEnv({ purge: vi.fn().mockRejectedValue(new Error('boom')) });
    expect(await recoverFromStaleBuild(env)).toBe(true);
    expect(env.reload).toHaveBeenCalledOnce();
  });
});

describe('canRecoverFromStaleBuild', () => {
  it('says yes when online and not purged inside the window', () => {
    const env = makeEnv();
    expect(canRecoverFromStaleBuild(env)).toBe(true);
    // A check, not a claim: nothing is written until a recovery starts.
    expect(env.writeLast).not.toHaveBeenCalled();
  });

  it('says no offline: a purge would delete the precache and nothing could refill it', () => {
    expect(canRecoverFromStaleBuild(makeEnv({ online: () => false }))).toBe(false);
  });

  it('says no inside the window', () => {
    const env = makeEnv({ readLast: vi.fn().mockReturnValue(1_000_000 - 30_000) });
    expect(canRecoverFromStaleBuild(env)).toBe(false);
  });

  it('says no when storage is unavailable', () => {
    const env = makeEnv({
      readLast: vi.fn(() => {
        throw new Error('denied');
      }),
    });
    expect(canRecoverFromStaleBuild(env)).toBe(false);
  });
});

describe('recoverFromStaleBuild offline', () => {
  it('declines without purging or reloading', async () => {
    const env = makeEnv({ online: () => false });
    expect(await recoverFromStaleBuild(env)).toBe(false);
    expect(env.writeLast).not.toHaveBeenCalled();
    expect(env.purge).not.toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
  });
});

describe('purgeStaleBuildCaches', () => {
  it('deletes only the Workbox precache, keeping SDE data, the engine and image caches', async () => {
    const names = [
      'workbox-precache-v2-https://neocom.example/',
      'sde-data',
      'dogma-engine-v1',
      'eve-type-images',
    ];
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => names,
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    const unregister = vi.fn(async () => true);
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: async () => [{ unregister }] },
    });
    try {
      await purgeStaleBuildCaches();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(deleted).toEqual(['workbox-precache-v2-https://neocom.example/']);
    expect(unregister).toHaveBeenCalledOnce();
  });
});

describe('isRecoveringFromStaleBuild', () => {
  it('turns true once a recovery has started, so a cancelled import can wait for the reload', async () => {
    vi.resetModules();
    const fresh = await import('./staleBuildRecovery');
    expect(fresh.isRecoveringFromStaleBuild()).toBe(false);
    const env = makeEnv({ purge: vi.fn(() => new Promise<void>(() => {})) });
    void fresh.recoverFromStaleBuild(env);
    expect(fresh.isRecoveringFromStaleBuild()).toBe(true);
  });

  it('stays false when the recovery declined', async () => {
    vi.resetModules();
    const fresh = await import('./staleBuildRecovery');
    await fresh.recoverFromStaleBuild(makeEnv({ online: () => false }));
    expect(fresh.isRecoveringFromStaleBuild()).toBe(false);
  });
});
