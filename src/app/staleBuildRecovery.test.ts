import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { StaleBuildEnv } from './staleBuildRecovery';

// Recovery state is module-level (a reloading page never clears it), so every
// test gets a fresh copy of the module.
let mod: typeof import('./staleBuildRecovery');
beforeEach(async () => {
  vi.resetModules();
  mod = await import('./staleBuildRecovery');
});

function makeEnv(overrides: Partial<StaleBuildEnv> = {}) {
  return {
    now: () => 1_000_000,
    online: () => true,
    readLast: vi.fn().mockReturnValue(0),
    writeLast: vi.fn(),
    probe: vi.fn().mockResolvedValue(true),
    purge: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
    ...overrides,
  } satisfies StaleBuildEnv;
}

describe('recoverFromStaleBuild', () => {
  it('probes the network, purges the worker and caches, then reloads', async () => {
    const env = makeEnv();
    expect(await mod.recoverFromStaleBuild(env)).toBe(true);
    expect(env.probe).toHaveBeenCalledOnce();
    expect(env.writeLast).toHaveBeenCalledWith(1_000_000);
    expect(env.purge).toHaveBeenCalledOnce();
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('declines a second purge inside the window, so it cannot loop', async () => {
    const env = makeEnv({ readLast: vi.fn().mockReturnValue(1_000_000 - 30_000) });
    expect(await mod.recoverFromStaleBuild(env)).toBe(false);
    expect(env.purge).not.toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('purges again once the window has passed', async () => {
    const env = makeEnv({ readLast: vi.fn().mockReturnValue(1_000_000 - 61_000) });
    expect(await mod.recoverFromStaleBuild(env)).toBe(true);
  });

  it('declines when storage is unavailable', async () => {
    const env = makeEnv({
      readLast: vi.fn(() => {
        throw new Error('denied');
      }),
    });
    expect(await mod.recoverFromStaleBuild(env)).toBe(false);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('reloads even when the purge throws', async () => {
    const env = makeEnv({ purge: vi.fn().mockRejectedValue(new Error('boom')) });
    expect(await mod.recoverFromStaleBuild(env)).toBe(true);
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('declines offline without probing, purging or reloading', async () => {
    const env = makeEnv({ online: () => false });
    expect(await mod.recoverFromStaleBuild(env)).toBe(false);
    expect(env.probe).not.toHaveBeenCalled();
    expect(env.writeLast).not.toHaveBeenCalled();
    expect(env.purge).not.toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
  });

  describe('when the network probe fails (online, but nothing reachable)', () => {
    it('purges nothing, reloads nothing, and does not spend the purge window', async () => {
      const env = makeEnv({ probe: vi.fn().mockResolvedValue(false) });
      expect(await mod.recoverFromStaleBuild(env)).toBe(false);
      expect(env.purge).not.toHaveBeenCalled();
      expect(env.reload).not.toHaveBeenCalled();
      expect(env.writeLast).not.toHaveBeenCalled();
    });

    it('treats a throwing probe the same way', async () => {
      const env = makeEnv({ probe: vi.fn().mockRejectedValue(new Error('boom')) });
      expect(await mod.recoverFromStaleBuild(env)).toBe(false);
      expect(env.purge).not.toHaveBeenCalled();
      expect(env.reload).not.toHaveBeenCalled();
    });

    it('stops reporting a recovery in flight, so a later failure can try again', async () => {
      const env = makeEnv({ probe: vi.fn().mockResolvedValue(false) });
      await mod.recoverFromStaleBuild(env);
      expect(mod.isRecoveringFromStaleBuild()).toBe(false);
      expect(mod.staleBuildRecoveryOutcome()).toBeNull();
    });
  });
});

describe('a recovery already in flight', () => {
  it('is reported from the moment it starts, before any await settles', () => {
    expect(mod.isRecoveringFromStaleBuild()).toBe(false);
    void mod.recoverFromStaleBuild(makeEnv({ probe: () => new Promise<boolean>(() => {}) }));
    expect(mod.isRecoveringFromStaleBuild()).toBe(true);
  });

  it('is shared by a second call in the same tick: one probe, one purge, one reload', async () => {
    const env = makeEnv();
    const [first, second] = await Promise.all([
      mod.recoverFromStaleBuild(env),
      mod.recoverFromStaleBuild(env),
    ]);
    expect([first, second]).toEqual([true, true]);
    expect(env.probe).toHaveBeenCalledOnce();
    expect(env.purge).toHaveBeenCalledOnce();
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('stays reported once reloading: the page is going away, not coming back', async () => {
    await mod.recoverFromStaleBuild(makeEnv());
    expect(mod.isRecoveringFromStaleBuild()).toBe(true);
  });

  it('stays false when the recovery declined', async () => {
    await mod.recoverFromStaleBuild(makeEnv({ online: () => false }));
    expect(mod.isRecoveringFromStaleBuild()).toBe(false);
  });
});

describe('canRecoverFromStaleBuild', () => {
  it('says yes when online and not purged inside the window', () => {
    const env = makeEnv();
    expect(mod.canRecoverFromStaleBuild(env)).toBe(true);
    // A check, not a claim: nothing is written until a recovery starts.
    expect(env.writeLast).not.toHaveBeenCalled();
  });

  it('says no offline: a purge would delete the precache and nothing could refill it', () => {
    expect(mod.canRecoverFromStaleBuild(makeEnv({ online: () => false }))).toBe(false);
  });

  it('says no inside the window', () => {
    const env = makeEnv({ readLast: vi.fn().mockReturnValue(1_000_000 - 30_000) });
    expect(mod.canRecoverFromStaleBuild(env)).toBe(false);
  });

  it('says no when storage is unavailable', () => {
    const env = makeEnv({
      readLast: vi.fn(() => {
        throw new Error('denied');
      }),
    });
    expect(mod.canRecoverFromStaleBuild(env)).toBe(false);
  });
});

describe('purgeStaleBuildCaches', () => {
  it('deletes only the Workbox precache, keeping SDE data, the engine and image caches', async () => {
    const names = [
      'workbox-precache-v2-https://neocom.example/',
      'sde-data',
      'dogma-engine-assets-1.2.3+4.5.6',
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
      await mod.purgeStaleBuildCaches();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(deleted).toEqual(['workbox-precache-v2-https://neocom.example/']);
    expect(unregister).toHaveBeenCalledOnce();
  });
});
