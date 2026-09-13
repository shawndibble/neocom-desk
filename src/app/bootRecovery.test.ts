import { describe, it, expect, vi } from 'vitest';
import { recoverFromStalledBoot, type BootRecoveryEnv } from './bootRecovery';

function makeEnv(overrides: Partial<BootRecoveryEnv> = {}) {
  return {
    getRegistration: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
    wait: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies BootRecoveryEnv;
}

describe('recoverFromStalledBoot', () => {
  it('promotes a waiting worker before reloading', async () => {
    const waiting = { postMessage: vi.fn() };
    const env = makeEnv({ getRegistration: vi.fn().mockResolvedValue({ waiting }) });
    await recoverFromStalledBoot(env);
    // Promoting the new bundle is what evicts the active one holding the old
    // schema version.
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('reloads when no update is waiting', async () => {
    const env = makeEnv({ getRegistration: vi.fn().mockResolvedValue({ waiting: null }) });
    await recoverFromStalledBoot(env);
    expect(env.wait).toHaveBeenCalledTimes(1); // the lookup bound only
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('reloads even when the registration lookup throws', async () => {
    const env = makeEnv({ getRegistration: vi.fn().mockRejectedValue(new Error('no sw')) });
    await recoverFromStalledBoot(env);
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it('reloads even when the registration lookup never settles', async () => {
    // The failure this whole path exists to escape. `try`/`catch` cannot help
    // here — a promise that never settles is not a rejection — so an unbounded
    // await would leave the button inert and the user back on the spinner.
    const env = makeEnv({ getRegistration: vi.fn().mockReturnValue(new Promise(() => {})) });
    await recoverFromStalledBoot(env);
    expect(env.reload).toHaveBeenCalledOnce();
  });
});
