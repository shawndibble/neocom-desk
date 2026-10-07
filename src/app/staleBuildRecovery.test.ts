import { describe, it, expect, vi } from 'vitest';
import { recoverFromStaleBuild, type StaleBuildEnv } from './staleBuildRecovery';

function makeEnv(overrides: Partial<StaleBuildEnv> = {}) {
  return {
    now: () => 1_000_000,
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
