import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NO_CORP_CAPABILITIES, type CorpCapabilities } from '@/engine/corpRoles';
import { useCorpAccess, type CorpAccess, type CorpAccessState } from './useCorpAccess';
import { useCorpRouteGate } from './useCorpRouteGate';

vi.mock('./useCorpAccess', () => ({ useCorpAccess: vi.fn() }));

const mockedAccess = vi.mocked(useCorpAccess);

function accessOf(state: CorpAccessState, capabilities: Partial<CorpCapabilities>): CorpAccess {
  return {
    state,
    capabilities: { ...NO_CORP_CAPABILITIES, ...capabilities },
    missingScopes: [],
    roles: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCorpRouteGate — no capability requirement', () => {
  it('is loading while Corp Access is unknown', () => {
    mockedAccess.mockReturnValue(accessOf('unknown', {}));
    const { result } = renderHook(() => useCorpRouteGate());
    expect(result.current).toEqual({ status: 'loading' });
  });

  it('is denied when Corp Access is none', () => {
    mockedAccess.mockReturnValue(accessOf('none', {}));
    const { result } = renderHook(() => useCorpRouteGate());
    expect(result.current).toEqual({ status: 'denied' });
  });

  it('is denied when Corp Access is roles-without-grant', () => {
    mockedAccess.mockReturnValue(accessOf('roles-without-grant', { canReadWallet: true }));
    const { result } = renderHook(() => useCorpRouteGate());
    expect(result.current).toEqual({ status: 'denied' });
  });

  it('is ready with the resolved capabilities once Corp Access is ready', () => {
    const access = accessOf('ready', { canReadStructures: true });
    mockedAccess.mockReturnValue(access);
    const { result } = renderHook(() => useCorpRouteGate());
    expect(result.current).toEqual({ status: 'ready', capabilities: access.capabilities });
  });
});

describe('useCorpRouteGate — with a capability requirement', () => {
  /**
   * `/corp/members` and `/corp/assets` each need one capability beyond plain
   * `ready` — this is that second gate, folded into the same hook rather than
   * re-derived at the call site.
   */
  it('is denied when ready but the required capability is not held', () => {
    mockedAccess.mockReturnValue(accessOf('ready', { canReadWallet: true }));
    const { result } = renderHook(() =>
      useCorpRouteGate((capabilities) => capabilities.canReadMembers)
    );
    expect(result.current).toEqual({ status: 'denied' });
  });

  it('is ready when the required capability is held', () => {
    const access = accessOf('ready', { canReadMembers: true });
    mockedAccess.mockReturnValue(access);
    const { result } = renderHook(() =>
      useCorpRouteGate((capabilities) => capabilities.canReadMembers)
    );
    expect(result.current).toEqual({ status: 'ready', capabilities: access.capabilities });
  });

  it('still waits on loading before the capability is even checked', () => {
    mockedAccess.mockReturnValue(accessOf('unknown', {}));
    const { result } = renderHook(() =>
      useCorpRouteGate((capabilities) => capabilities.canReadMembers)
    );
    expect(result.current).toEqual({ status: 'loading' });
  });
});
