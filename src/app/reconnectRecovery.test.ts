import { describe, expect, it, vi } from 'vitest';
import { recoverFromReconnect, type ReconnectRecoveryDeps } from './reconnectRecovery';

function deps(overrides: Partial<ReconnectRecoveryDeps> = {}): ReconnectRecoveryDeps {
  return {
    clearRevalidationFailures: vi.fn(),
    emitCacheRevalidated: vi.fn(),
    activeCharacterId: () => 7,
    syncConfigured: () => true,
    triggerSync: vi.fn(async () => {}),
    warmLazySde: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('recoverFromReconnect', () => {
  it('forgets held failures before telling mounted routes to re-read', () => {
    const order: string[] = [];
    const d = deps({
      clearRevalidationFailures: vi.fn(() => void order.push('clear')),
      emitCacheRevalidated: vi.fn(() => void order.push('emit')),
    });

    recoverFromReconnect(d);

    expect(order).toEqual(['clear', 'emit']);
  });

  it('syncs the active Character', () => {
    const d = deps();
    recoverFromReconnect(d);
    expect(d.triggerSync).toHaveBeenCalledWith(7);
  });

  it('skips the sync with no active Character or no sync configured', () => {
    const none = deps({ activeCharacterId: () => null });
    recoverFromReconnect(none);
    expect(none.triggerSync).not.toHaveBeenCalled();

    const unconfigured = deps({ syncConfigured: () => false });
    recoverFromReconnect(unconfigured);
    expect(unconfigured.triggerSync).not.toHaveBeenCalled();
  });

  it('re-runs the lazy SDE warm', () => {
    const d = deps();
    recoverFromReconnect(d);
    expect(d.warmLazySde).toHaveBeenCalledTimes(1);
  });

  it('swallows a failing sync or warm: recovery is best effort', async () => {
    const d = deps({
      triggerSync: vi.fn(async () => {
        throw new Error('still down');
      }),
      warmLazySde: vi.fn(async () => {
        throw new Error('chunk failed');
      }),
    });

    expect(() => recoverFromReconnect(d)).not.toThrow();
    await Promise.resolve();
  });
});
