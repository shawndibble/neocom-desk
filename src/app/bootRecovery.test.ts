import { describe, it, expect, vi } from 'vitest';
import { recoverFromStalledBoot, type BootRecoveryEnv } from './bootRecovery';

function env(overrides: Partial<BootRecoveryEnv> = {}) {
  return {
    getRegistration: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
    wait: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies BootRecoveryEnv;
}

describe('recoverFromStalledBoot', () => {
  it('retires a waiting service worker before reloading', async () => {
    const waiting = { postMessage: vi.fn() };
    const it_ = env({ getRegistration: vi.fn().mockResolvedValue({ waiting }) });
    await recoverFromStalledBoot(it_);
    // The old bundle is what holds the previous schema version open; it has to
    // go before the reload, or the next boot blocks on it again.
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(it_.reload).toHaveBeenCalledOnce();
  });

  it('reloads when there is no waiting worker', async () => {
    const it_ = env({ getRegistration: vi.fn().mockResolvedValue({ waiting: null }) });
    await recoverFromStalledBoot(it_);
    expect(it_.wait).not.toHaveBeenCalled();
    expect(it_.reload).toHaveBeenCalledOnce();
  });

  it('reloads even when the registration lookup throws', async () => {
    const it_ = env({ getRegistration: vi.fn().mockRejectedValue(new Error('no sw')) });
    await recoverFromStalledBoot(it_);
    // The reload is the whole point; nothing above it may prevent it.
    expect(it_.reload).toHaveBeenCalledOnce();
  });
});
